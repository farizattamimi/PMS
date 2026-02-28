import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { isAdmin, isManager, assertManagerOwnsProperty } from '@/lib/access'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const unit = await prisma.unit.findUnique({
    where: { id: params.id },
    include: {
      property: true,
      building: true,
      leases: {
        include: {
          tenant: { include: { user: { select: { name: true, email: true } } } },
          ledgerEntries: { orderBy: { effectiveDate: 'desc' }, take: 12 },
        },
        orderBy: { startDate: 'desc' },
      },
      workOrders: {
        include: {
          submittedBy: { select: { name: true } },
          assignedVendor: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!unit) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (isManager(session) && unit.property.managerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(unit)
}

const ALLOWED_PATCH_FIELDS = [
  'unitNumber', 'bedrooms', 'bathrooms', 'sqFt', 'monthlyRent',
  'marketRent', 'status', 'buildingId',
]

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const existing = await prisma.unit.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!(await assertManagerOwnsProperty(session, existing.propertyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const data: Record<string, unknown> = {}
  for (const f of ALLOWED_PATCH_FIELDS) {
    if (body[f] !== undefined) data[f] = body[f]
  }

  const unit = await prisma.unit.update({
    where: { id: params.id },
    data,
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: body.status && body.status !== existing.status ? 'STATUS_CHANGE' : 'UPDATE',
    entityType: 'Unit',
    entityId: params.id,
    diff: data,
  })

  return NextResponse.json(unit)
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await prisma.unit.delete({ where: { id: params.id } })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'DELETE',
    entityType: 'Unit',
    entityId: params.id,
  })

  return NextResponse.json({ success: true })
}
