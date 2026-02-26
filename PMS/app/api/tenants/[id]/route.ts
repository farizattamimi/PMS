import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      leases: {
        include: {
          unit: { include: { property: { select: { name: true } } } },
          ledgerEntries: { orderBy: { effectiveDate: 'desc' } },
        },
        orderBy: { startDate: 'desc' },
      },
    },
  })

  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(tenant)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const existing = await prisma.tenant.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const tenant = await prisma.tenant.update({
    where: { id: params.id },
    data: body,
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: body.status && body.status !== existing.status ? 'STATUS_CHANGE' : 'UPDATE',
    entityType: 'Tenant',
    entityId: params.id,
    diff: body,
  })

  return NextResponse.json(tenant)
}
