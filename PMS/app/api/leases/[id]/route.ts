import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { isManager, assertManagerOwnsProperty } from '@/lib/access'

const ALLOWED_PATCH_FIELDS = ['status', 'monthlyRent', 'depositAmount', 'startDate', 'endDate']

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const lease = await prisma.lease.findUnique({
    where: { id: params.id },
    include: {
      unit: { include: { property: true } },
      tenant: { include: { user: { select: { name: true, email: true } } } },
      ledgerEntries: { orderBy: { effectiveDate: 'desc' } },
    },
  })

  if (!lease) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (isManager(session) && lease.unit?.property?.managerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(lease)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const existing = await prisma.lease.findUnique({
    where: { id: params.id },
    include: { unit: { select: { propertyId: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const propertyId = existing.propertyId ?? existing.unit?.propertyId
  if (propertyId && !(await assertManagerOwnsProperty(session, propertyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  // Whitelist fields
  const updateData: Record<string, unknown> = {}
  for (const f of ALLOWED_PATCH_FIELDS) {
    if (body[f] !== undefined) updateData[f] = body[f]
  }
  if (body.startDate !== undefined) updateData.startDate = new Date(body.startDate)
  if (body.endDate !== undefined) updateData.endDate = new Date(body.endDate)

  // Enforce single ACTIVE lease per unit when activating a DRAFT
  if (updateData.status === 'ACTIVE' && existing.status === 'DRAFT') {
    const activeCheck = await prisma.lease.findFirst({
      where: { unitId: existing.unitId, status: 'ACTIVE', id: { not: params.id } },
    })
    if (activeCheck) {
      return NextResponse.json({ error: 'Unit already has an active lease' }, { status: 409 })
    }
    updateData.signedAt = new Date()
  }

  const lease = await prisma.$transaction(async (tx) => {
    const lease = await tx.lease.update({ where: { id: params.id }, data: updateData })

    if (updateData.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      await tx.unit.update({ where: { id: lease.unitId }, data: { status: 'OCCUPIED' } })
      await tx.tenant.updateMany({ where: { id: lease.tenantId }, data: { status: 'ACTIVE' } })
    }
    if (updateData.status === 'ENDED' || updateData.status === 'TERMINATED') {
      await tx.unit.update({ where: { id: lease.unitId }, data: { status: 'AVAILABLE' } })
      await tx.tenant.updateMany({ where: { id: lease.tenantId }, data: { status: 'PAST' } })
    }
    return lease
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: updateData.status && updateData.status !== existing.status ? 'STATUS_CHANGE' : 'UPDATE',
    entityType: 'Lease',
    entityId: params.id,
    diff: { before: { status: existing.status }, after: updateData },
  })

  return NextResponse.json(lease)
}
