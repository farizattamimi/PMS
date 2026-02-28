import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { isTenant, propertyScopeWhere } from '@/lib/access'

const ALLOWED_PATCH_FIELDS = ['name', 'address', 'city', 'state', 'zip', 'type', 'status']

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isTenant(session)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const property = await prisma.property.findFirst({
    where: {
      id: params.id,
      ...propertyScopeWhere(session),
    },
    include: {
      manager: { select: { id: true, name: true, email: true } },
      units: {
        include: {
          leases: {
            where: { status: 'ACTIVE' },
            include: { tenant: { include: { user: { select: { name: true } } } } },
          },
        },
        orderBy: { unitNumber: 'asc' },
      },
      buildings: { orderBy: { name: 'asc' } },
      leases: {
        include: {
          unit: { select: { unitNumber: true } },
          tenant: { include: { user: { select: { name: true, email: true } } } },
        },
        orderBy: { startDate: 'desc' },
      },
      ledgerEntries: {
        orderBy: { effectiveDate: 'desc' },
        take: 50,
      },
      workOrders: {
        include: {
          unit: { select: { unitNumber: true } },
          submittedBy: { select: { name: true } },
          assignedVendor: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      propertyVendors: {
        include: { vendor: true },
      },
    },
  })

  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(property)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || isTenant(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const existing = await prisma.property.findFirst({
    where: {
      id: params.id,
      ...propertyScopeWhere(session),
    },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const data: Record<string, unknown> = {}
  for (const f of ALLOWED_PATCH_FIELDS) {
    if (body[f] !== undefined) data[f] = body[f]
  }

  const property = await prisma.property.update({
    where: { id: params.id },
    data,
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: body.status && body.status !== existing.status ? 'STATUS_CHANGE' : 'UPDATE',
    entityType: 'Property',
    entityId: params.id,
    diff: { before: { status: existing.status }, after: data },
  })

  return NextResponse.json(property)
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await prisma.property.delete({ where: { id: params.id } })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'DELETE',
    entityType: 'Property',
    entityId: params.id,
  })

  return NextResponse.json({ success: true })
}
