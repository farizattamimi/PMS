import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { isManager } from '@/lib/access'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      leases: {
        include: {
          unit: { include: { property: { select: { id: true, name: true, managerId: true } } } },
          ledgerEntries: { orderBy: { effectiveDate: 'desc' } },
        },
        orderBy: { startDate: 'desc' },
      },
    },
  })

  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Manager can only view tenants with leases on their properties
  if (isManager(session)) {
    const hasAccessibleLease = tenant.leases.some(
      (l: any) => l.unit?.property?.managerId === session.user.id
    )
    if (!hasAccessibleLease) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  return NextResponse.json(tenant)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const existing = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: { leases: { include: { unit: { select: { property: { select: { managerId: true } } } } } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Manager scope check
  if (isManager(session)) {
    const hasAccessibleLease = existing.leases.some(
      (l: any) => l.unit?.property?.managerId === session.user.id
    )
    if (!hasAccessibleLease) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const body = await req.json()
  const allowed = ['phone', 'emergencyContactName', 'emergencyContactPhone', 'status']
  const data: Record<string, unknown> = {}
  for (const f of allowed) {
    if (body[f] !== undefined) data[f] = body[f]
  }

  const tenant = await prisma.tenant.update({
    where: { id: params.id },
    data,
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: body.status && body.status !== existing.status ? 'STATUS_CHANGE' : 'UPDATE',
    entityType: 'Tenant',
    entityId: params.id,
    diff: data,
  })

  return NextResponse.json(tenant)
}
