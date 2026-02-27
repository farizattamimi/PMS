import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canAccessScopedPropertyId, scopedPropertyIdsForManagerViews } from '@/lib/access'
import { sessionProvider } from '@/lib/session-provider'

// GET /api/agent/runs/[id] — full run detail with steps + action logs + exceptions
export async function GET(
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
    include: {
      steps: { orderBy: { stepOrder: 'asc' } },
      actionLogs: { orderBy: { createdAt: 'asc' } },
      exceptions: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!run) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!canAccessScopedPropertyId(scopedPropertyIds, run.propertyId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(run)
}
