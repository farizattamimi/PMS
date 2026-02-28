import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { assertManagerOwnsProperty } from '@/lib/access'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const incident = await prisma.incident.findUnique({ where: { id: params.id } })
  if (!incident) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!(await assertManagerOwnsProperty(session, incident.propertyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const updateData: any = {}

  const VALID_STATUSES = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED']
  const VALID_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
    }
    updateData.status = body.status
    if (body.status === 'RESOLVED' || body.status === 'CLOSED') {
      updateData.resolvedAt = new Date()
    }
  }
  if (body.resolution !== undefined) updateData.resolution = body.resolution
  if (body.severity !== undefined) {
    if (!VALID_SEVERITIES.includes(body.severity)) {
      return NextResponse.json({ error: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}` }, { status: 400 })
    }
    updateData.severity = body.severity
  }

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
