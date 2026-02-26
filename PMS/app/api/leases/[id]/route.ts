import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
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
  return NextResponse.json(lease)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const existing = await prisma.lease.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()

  // Enforce single ACTIVE lease per unit when activating a DRAFT
  if (body.status === 'ACTIVE' && existing.status === 'DRAFT') {
    const activeCheck = await prisma.lease.findFirst({
      where: { unitId: existing.unitId, status: 'ACTIVE', id: { not: params.id } },
    })
    if (activeCheck) {
      return NextResponse.json({ error: 'Unit already has an active lease' }, { status: 409 })
    }
  }

  const updateData: any = { ...body }
  if (body.status === 'ACTIVE' && existing.status === 'DRAFT') {
    updateData.signedAt = new Date()
  }

  const lease = await prisma.$transaction(async (tx) => {
    const lease = await tx.lease.update({ where: { id: params.id }, data: updateData })

    if (body.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      await tx.unit.update({ where: { id: lease.unitId }, data: { status: 'OCCUPIED' } })
      await tx.tenant.updateMany({ where: { id: lease.tenantId }, data: { status: 'ACTIVE' } })
    }
    if (body.status === 'ENDED' || body.status === 'TERMINATED') {
      await tx.unit.update({ where: { id: lease.unitId }, data: { status: 'AVAILABLE' } })
      await tx.tenant.updateMany({ where: { id: lease.tenantId }, data: { status: 'PAST' } })
    }
    return lease
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: body.status && body.status !== existing.status ? 'STATUS_CHANGE' : 'UPDATE',
    entityType: 'Lease',
    entityId: params.id,
    diff: { before: { status: existing.status }, after: body },
  })

  return NextResponse.json(lease)
}
