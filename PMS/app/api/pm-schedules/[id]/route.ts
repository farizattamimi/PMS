import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { isAdmin, isManager } from '@/lib/access'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const schedule = await prisma.pMSchedule.findUnique({
    where: { id: params.id },
    include: { asset: { select: { property: { select: { managerId: true } } } } },
  })
  if (!schedule) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (isManager(session) && schedule.asset?.property?.managerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const updateData: any = {}

  const fields = ['title', 'description', 'frequencyDays', 'vendorId', 'autoCreateWO', 'isActive']
  for (const f of fields) {
    if (body[f] !== undefined) updateData[f] = body[f]
  }
  if (body.nextDueAt !== undefined) updateData.nextDueAt = new Date(body.nextDueAt)

  const updated = await prisma.pMSchedule.update({ where: { id: params.id }, data: updateData })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'UPDATE',
    entityType: 'PMSchedule',
    entityId: params.id,
    diff: updateData,
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const schedule = await prisma.pMSchedule.findUnique({
    where: { id: params.id },
    include: { asset: { select: { property: { select: { managerId: true } } } } },
  })
  if (!schedule) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (isManager(session) && schedule.asset?.property?.managerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.pMSchedule.delete({ where: { id: params.id } })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'DELETE',
    entityType: 'PMSchedule',
    entityId: params.id,
  })

  return NextResponse.json({ ok: true })
}
