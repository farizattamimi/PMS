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

  const incident = await prisma.incident.findUnique({ where: { id: params.id } })
  if (!incident) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!(await assertManagerOwnsProperty(session, incident.propertyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const updateData: any = {}

  if (body.status !== undefined) {
    updateData.status = body.status
    if (body.status === 'RESOLVED' || body.status === 'CLOSED') {
      updateData.resolvedAt = new Date()
    }
  }
  if (body.resolution !== undefined) updateData.resolution = body.resolution
  if (body.severity !== undefined) updateData.severity = body.severity

  const updated = await prisma.incident.update({
    where: { id: params.id },
    data: updateData,
    include: { property: { select: { id: true, name: true } } },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'UPDATE',
    entityType: 'Incident',
    entityId: params.id,
    diff: updateData,
  })

  return NextResponse.json(updated)
}
