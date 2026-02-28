import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { isManager } from '@/lib/access'

const VALID_CONDITIONS = ['GOOD', 'FAIR', 'POOR', 'FAILED']

export async function PATCH(req: Request, { params }: { params: { id: string; itemId: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const item = await prisma.inspectionItem.findUnique({
    where: { id: params.itemId },
    include: { inspection: { select: { propertyId: true, property: { select: { managerId: true } } } } },
  })
  if (!item || item.inspectionId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (isManager(session) && item.inspection?.property?.managerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  if (body.condition !== undefined && !VALID_CONDITIONS.includes(body.condition)) {
    return NextResponse.json({ error: `condition must be one of: ${VALID_CONDITIONS.join(', ')}` }, { status: 400 })
  }

  const updateData: any = {}
  if (body.condition !== undefined) updateData.condition = body.condition
  if (body.notes !== undefined) updateData.notes = body.notes
  if (body.photoDocId !== undefined) updateData.photoDocId = body.photoDocId
  if (body.area !== undefined) updateData.area = body.area

  const updated = await prisma.inspectionItem.update({ where: { id: params.itemId }, data: updateData })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'UPDATE',
    entityType: 'InspectionItem',
    entityId: params.itemId,
    diff: updateData,
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: Request, { params }: { params: { id: string; itemId: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const item = await prisma.inspectionItem.findUnique({
    where: { id: params.itemId },
    include: { inspection: { select: { propertyId: true, property: { select: { managerId: true } } } } },
  })
  if (!item || item.inspectionId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (isManager(session) && item.inspection?.property?.managerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.inspectionItem.delete({ where: { id: params.itemId } })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'DELETE',
    entityType: 'InspectionItem',
    entityId: params.itemId,
  })

  return NextResponse.json({ ok: true })
}
