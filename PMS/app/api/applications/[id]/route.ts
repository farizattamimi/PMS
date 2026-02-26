import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const application = await prisma.tenantApplication.findUnique({
    where: { id: params.id },
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true } },
      tenant: { select: { id: true } },
    },
  })

  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(application)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const application = await prisma.tenantApplication.findUnique({ where: { id: params.id } })
  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { status, reviewNotes, approvedRent, approvedMoveIn, unitId } = body

  const data: any = {}
  if (status !== undefined) {
    data.status = status
    data.reviewedBy = session.user.id
    data.reviewedAt = new Date()
  }
  if (reviewNotes !== undefined) data.reviewNotes = reviewNotes
  if (approvedRent !== undefined) data.approvedRent = Number(approvedRent)
  if (approvedMoveIn !== undefined) data.approvedMoveIn = new Date(approvedMoveIn)
  if (unitId !== undefined) data.unitId = unitId || null

  const updated = await prisma.tenantApplication.update({
    where: { id: params.id },
    data,
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true } },
      tenant: { select: { id: true } },
    },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'UPDATE',
    entityType: 'TenantApplication',
    entityId: params.id,
    diff: data,
  })

  return NextResponse.json(updated)
}
