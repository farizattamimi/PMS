import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { assertManagerOwnsProperty } from '@/lib/access'

export async function GET(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const propertyId = searchParams.get('propertyId')

  const where: any = {}
  if (status) where.status = status
  if (propertyId) where.propertyId = propertyId
  if (session.user.systemRole === 'TENANT') {
    const tenant = await prisma.tenant.findUnique({ where: { userId: session.user.id } })
    if (tenant) where.tenantId = tenant.id
  }
  if (session.user.systemRole === 'MANAGER') {
    where.unit = { property: { managerId: session.user.id } }
  }

  const leases = await prisma.lease.findMany({
    where,
    include: {
      unit: { include: { property: { select: { id: true, name: true } } } },
      tenant: { include: { user: { select: { id: true, name: true, email: true } } } },
      _count: { select: { ledgerEntries: true } },
    },
    orderBy: { startDate: 'desc' },
  })

  return NextResponse.json(leases)
}

export async function POST(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { unitId, tenantId, startDate, endDate, monthlyRent, depositAmount, status } = body

  if (!unitId || !tenantId || !startDate || !endDate || !monthlyRent) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Get propertyId from unit and verify ownership
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { propertyId: true } })
  if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })

  if (!(await assertManagerOwnsProperty(session, unit.propertyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Enforce single ACTIVE lease per unit
  const leaseStatus = status ?? 'DRAFT'
  if (leaseStatus === 'ACTIVE') {
    const existing = await prisma.lease.findFirst({ where: { unitId, status: 'ACTIVE' } })
    if (existing) {
      return NextResponse.json({ error: 'Unit already has an active lease' }, { status: 409 })
    }
  }

  const lease = await prisma.$transaction(async (tx) => {
    const lease = await tx.lease.create({
      data: {
        unitId,
        tenantId,
        propertyId: unit.propertyId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        monthlyRent,
        depositAmount: depositAmount ?? 0,
        status: leaseStatus,
        signedAt: leaseStatus === 'ACTIVE' ? new Date() : null,
      },
    })
    if (leaseStatus === 'ACTIVE') {
      await tx.unit.update({ where: { id: unitId }, data: { status: 'OCCUPIED' } })
      await tx.tenant.updateMany({ where: { id: tenantId }, data: { status: 'ACTIVE' } })
    }
    return lease
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'Lease',
    entityId: lease.id,
    diff: { unitId, tenantId, status: lease.status },
  })

  return NextResponse.json(lease, { status: 201 })
}
