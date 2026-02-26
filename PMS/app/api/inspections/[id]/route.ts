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

  const inspection = await prisma.inspection.findUnique({
    where: { id: params.id },
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true } },
      items: {
        include: {
          asset: { select: { id: true, name: true, category: true } },
        },
        orderBy: { area: 'asc' },
      },
    },
  })

  if (!inspection) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(inspection)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const inspection = await prisma.inspection.findUnique({ where: { id: params.id } })
  if (!inspection) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updateData: any = {}

  const fields = ['status', 'notes', 'scheduledAt', 'unitId']
  for (const f of fields) {
    if (body[f] !== undefined) updateData[f] = body[f]
  }
  if (body.scheduledAt) updateData.scheduledAt = new Date(body.scheduledAt)
  if (body.status === 'COMPLETED' && !inspection.completedAt) {
    updateData.completedAt = new Date()
  }

  const updated = await prisma.inspection.update({ where: { id: params.id }, data: updateData })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'UPDATE',
    entityType: 'Inspection',
    entityId: params.id,
    diff: updateData,
  })

  return NextResponse.json(updated)
}
