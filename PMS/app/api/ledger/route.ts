import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { deliverNotification } from '@/lib/deliver'
import { rentChargeEmail, rentChargeSms } from '@/lib/email'
import { LedgerEntryType } from '@prisma/client'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')
  const leaseId = searchParams.get('leaseId')
  const type = searchParams.get('type') as LedgerEntryType | null
  const month = searchParams.get('month') // YYYY-MM

  const where: any = {}
  if (propertyId) where.propertyId = propertyId
  if (leaseId) where.leaseId = leaseId
  if (type) where.type = type
  if (month) {
    const start = new Date(`${month}-01`)
    const end = new Date(start)
    end.setMonth(end.getMonth() + 1)
    where.effectiveDate = { gte: start, lt: end }
  }

  if (session.user.systemRole === 'TENANT') {
    const tenant = await prisma.tenant.findUnique({ where: { userId: session.user.id } })
    if (tenant) {
      const tenantLeases = await prisma.lease.findMany({ where: { tenantId: tenant.id }, select: { id: true } })
      where.leaseId = { in: tenantLeases.map(l => l.id) }
    }
  } else if (session.user.systemRole === 'MANAGER') {
    const managed = await prisma.property.findMany({ where: { managerId: session.user.id }, select: { id: true } })
    const managedIds = managed.map(p => p.id)
    if (propertyId) {
      // Verify the requested property belongs to this manager
      if (!managedIds.includes(propertyId)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else {
      where.propertyId = { in: managedIds }
    }
  }

  const entries = await prisma.ledgerEntry.findMany({
    where,
    include: {
      lease: {
        include: {
          unit: { include: { property: { select: { name: true } } } },
          tenant: { include: { user: { select: { name: true } } } },
        },
      },
      property: { select: { name: true } },
    },
    orderBy: { effectiveDate: 'desc' },
  })

  return NextResponse.json(entries)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { leaseId, propertyId, type, amount, effectiveDate, memo, currency } = body

  if (!type || amount == null || !effectiveDate) {
    return NextResponse.json({ error: 'Missing required fields: type, amount, effectiveDate' }, { status: 400 })
  }

  const entry = await prisma.ledgerEntry.create({
    data: {
      leaseId: leaseId ?? null,
      propertyId: propertyId ?? null,
      type: type as LedgerEntryType,
      amount: parseFloat(amount),
      currency: currency ?? 'USD',
      effectiveDate: new Date(effectiveDate),
      memo: memo ?? null,
    },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'LedgerEntry',
    entityId: entry.id,
    diff: { type, amount, effectiveDate },
  })

  // Notify tenant when a rent charge is created
  if (type === 'RENT' && leaseId && parseFloat(amount) > 0) {
    const lease = await prisma.lease.findUnique({
      where: { id: leaseId },
      include: { tenant: { include: { user: { select: { id: true, name: true, email: true } } } }, unit: { select: { unitNumber: true } } },
    })
    if (lease?.tenant?.user) {
      const { id: tenantUserId, name } = lease.tenant.user
      const unitNum = lease.unit?.unitNumber ?? ''
      await deliverNotification({
        userId: tenantUserId,
        title: 'Rent charge posted',
        body: `$${parseFloat(amount).toLocaleString()} due on ${effectiveDate}`,
        type: 'PAYMENT_DUE',
        entityType: 'LedgerEntry',
        entityId: entry.id,
        emailSubject: 'Rent charge posted to your account',
        emailHtml: rentChargeEmail(name, parseFloat(amount), effectiveDate, unitNum),
        smsBody: rentChargeSms(name, parseFloat(amount), effectiveDate, unitNum),
      })
    }
  }

  return NextResponse.json(entry, { status: 201 })
}
