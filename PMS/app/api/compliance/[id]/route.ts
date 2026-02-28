import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { assertManagerOwnsProperty } from '@/lib/access'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const item = await prisma.complianceItem.findUnique({ where: { id: params.id } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!(await assertManagerOwnsProperty(session, item.propertyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const updateData: any = {}

  const fields = ['title', 'category', 'authority', 'renewalDays', 'notes', 'docId', 'status']
  for (const f of fields) {
    if (body[f] !== undefined) updateData[f] = body[f]
  }
  if (body.dueDate !== undefined) updateData.dueDate = new Date(body.dueDate)
  if (body.status === 'COMPLIANT' && !item.completedAt) {
    updateData.completedAt = new Date()
    // If it's recurring, advance dueDate
    if (item.renewalDays) {
      const next = new Date()
      next.setDate(next.getDate() + item.renewalDays)
      updateData.dueDate = next
      updateData.status = 'PENDING'
      updateData.completedAt = null
    }
  }

  const updated = await prisma.complianceItem.update({ where: { id: params.id }, data: updateData })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'UPDATE',
    entityType: 'ComplianceItem',
    entityId: params.id,
    diff: updateData,
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const item = await prisma.complianceItem.findUnique({ where: { id: params.id } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!(await assertManagerOwnsProperty(session, item.propertyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.complianceItem.delete({ where: { id: params.id } })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'DELETE',
    entityType: 'ComplianceItem',
    entityId: params.id,
  })

  return NextResponse.json({ ok: true })
}
