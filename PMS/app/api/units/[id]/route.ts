import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
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
  return NextResponse.json(unit)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const existing = await prisma.unit.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const unit = await prisma.unit.update({
    where: { id: params.id },
    data: body,
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: body.status && body.status !== existing.status ? 'STATUS_CHANGE' : 'UPDATE',
    entityType: 'Unit',
    entityId: params.id,
    diff: body,
  })

  return NextResponse.json(unit)
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
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
