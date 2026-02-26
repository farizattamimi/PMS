import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const schedule = await prisma.pMSchedule.findUnique({ where: { id: params.id } })
  if (!schedule) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const schedule = await prisma.pMSchedule.findUnique({ where: { id: params.id } })
  if (!schedule) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.pMSchedule.delete({ where: { id: params.id } })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'DELETE',
    entityType: 'PMSchedule',
    entityId: params.id,
  })

  return NextResponse.json({ ok: true })
}
