import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAccessScopedPropertyId, scopedPropertyIdsForManagerViews } from '@/lib/access'
import { sessionProvider } from '@/lib/session-provider'

// PATCH /api/agent/exceptions/[id] — ack or resolve
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const scopedPropertyIds = await scopedPropertyIdsForManagerViews(session)

  const body = await req.json().catch(() => ({}))
  const { status } = body

  if (!['ACK', 'RESOLVED'].includes(status)) {
    return NextResponse.json({ error: 'status must be ACK or RESOLVED' }, { status: 400 })
  }

  const ex = await prisma.agentException.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, propertyId: true },
  })
  if (!ex) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canAccessScopedPropertyId(scopedPropertyIds, ex.propertyId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updated = await prisma.agentException.update({
    where: { id: params.id },
    data: {
      status,
      resolvedById: status === 'RESOLVED' ? session.user.id : undefined,
      resolvedAt: status === 'RESOLVED' ? new Date() : undefined,
    },
  })

  return NextResponse.json(updated)
}
