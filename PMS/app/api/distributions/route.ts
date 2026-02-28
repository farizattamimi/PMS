import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { deliverNotification } from '@/lib/deliver'
import { distributionNoticeEmail, distributionNoticeSms } from '@/lib/email'

// GET — list distributions (manager/admin)
export async function GET(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')

  const where: any = {}
  if (propertyId) where.propertyId = propertyId
  if (session.user.systemRole === 'MANAGER') {
    where.property = { managerId: session.user.id }
  }

  const distributions = await prisma.distribution.findMany({
    where,
    include: {
      property: { select: { name: true } },
      ownerOrg: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(distributions)
}

// POST — create a distribution statement
export async function POST(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { propertyId, period, managementFeePct, memo } = body

  if (!propertyId || !period || managementFeePct == null) {
    return NextResponse.json({ error: 'propertyId, period, and managementFeePct required' }, { status: 400 })
  }

  if (typeof managementFeePct !== 'number' || managementFeePct < 0 || managementFeePct > 100) {
    return NextResponse.json({ error: 'managementFeePct must be a number between 0 and 100' }, { status: 400 })
  }

  if (!/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: 'period must be in YYYY-MM format' }, { status: 400 })
  }

  // Verify property access and get owner org
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      ...(session.user.systemRole === 'MANAGER' ? { managerId: session.user.id } : {}),
    },
    select: { id: true, name: true, ownerOrgId: true },
  })

  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  if (!property.ownerOrgId) return NextResponse.json({ error: 'Property has no owner organization' }, { status: 400 })

  // Calculate financials from ledger for this period
  const [year, month] = period.split('-').map(Number)
  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      propertyId,
      effectiveDate: { gte: startOfMonth, lte: endOfMonth },
    },
    select: { amount: true },
  })

  const grossIncome = entries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0)
  const expenses = entries.filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)
  const managementFee = Math.round(grossIncome * (managementFeePct / 100) * 100) / 100
  const netDistribution = Math.round((grossIncome - expenses - managementFee) * 100) / 100

  const distribution = await prisma.distribution.create({
    data: {
      propertyId,
      ownerOrgId: property.ownerOrgId,
      period,
      grossIncome,
      expenses,
      managementFee,
      managementFeePct,
      netDistribution,
      memo: memo ?? null,
    },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'Distribution',
    entityId: distribution.id,
    diff: { propertyId, period, netDistribution },
  })

  return NextResponse.json(distribution, { status: 201 })
}
