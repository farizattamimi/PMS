import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createRun } from '@/lib/agent-runtime'
import { runMaintenanceAutopilot } from '@/lib/workflows/maintenance-autopilot'

// GET /api/agent/runs — list runs (manager sees own property runs)
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const propertyId = searchParams.get('propertyId')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (propertyId) where.propertyId = propertyId

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
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { propertyId, triggerType = 'manual', entityId, workflowType = 'MAINTENANCE' } = body

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
