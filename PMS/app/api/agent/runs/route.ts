import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createRun } from '@/lib/agent-runtime'
import { runMaintenanceAutopilot } from '@/lib/workflows/maintenance-autopilot'
import { sessionProvider } from '@/lib/session-provider'
import {
  canAccessScopedPropertyId,
  scopedPropertyIdFilter,
  scopedPropertyIdsForManagerViews,
} from '@/lib/access'

// GET /api/agent/runs — list runs (manager sees own property runs)
export async function GET(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const scopedPropertyIds = await scopedPropertyIdsForManagerViews(session)

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const propertyId = searchParams.get('propertyId')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  const propertyFilter = scopedPropertyIdFilter(scopedPropertyIds, propertyId)
  if (propertyFilter !== undefined) where.propertyId = propertyFilter

  const runs = await prisma.agentRun.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      _count: { select: { steps: true, exceptions: true } },
    },
  })

  return NextResponse.json(runs)
}

// POST /api/agent/runs — manual trigger
export async function POST(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const scopedPropertyIds = await scopedPropertyIdsForManagerViews(session)

  const body = await req.json().catch(() => ({}))
  const { propertyId, triggerType = 'manual', entityId, workflowType = 'MAINTENANCE' } = body
  if (!propertyId) {
    return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
  }
  if (!canAccessScopedPropertyId(scopedPropertyIds, propertyId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const runId = await createRun({
    triggerType,
    triggerRef: `manual-${session.user.id}-${Date.now()}`,
    propertyId,
  })

  // Fire-and-forget execution
  if (workflowType === 'MAINTENANCE' && propertyId) {
    runMaintenanceAutopilot({
      runId,
      propertyId,
      triggerType: 'UNASSIGNED_WO',
      entityId: entityId ?? runId,
    }).catch(console.error)
  }

  return NextResponse.json({ ok: true, runId })
}
