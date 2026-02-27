import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAccessScopedPropertyId, scopedPropertyIdsForManagerViews } from '@/lib/access'
import { sessionProvider } from '@/lib/session-provider'

// POST /api/agent/runs/[id]/cancel
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const scopedPropertyIds = await scopedPropertyIdsForManagerViews(session)

  const run = await prisma.agentRun.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, propertyId: true },
  })

  if (!run) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!canAccessScopedPropertyId(scopedPropertyIds, run.propertyId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (run.status === 'COMPLETED' || run.status === 'FAILED') {
    return NextResponse.json({ error: `Run is already ${run.status}` }, { status: 409 })
  }

  await prisma.agentRun.update({
    where: { id: params.id },
    data: { status: 'FAILED', completedAt: new Date(), error: 'Cancelled by user' },
  })

  return NextResponse.json({ ok: true })
}
