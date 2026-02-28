import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { enqueueWorkflowRun, type WorkflowType } from '@/lib/agent-orchestrator'
import { sessionProvider } from '@/lib/session-provider'
import {
  canAccessScopedPropertyId,
  scopedPropertyIdFilter,
  scopedPropertyIdsForManagerViews,
} from '@/lib/access'
import { checkRateLimit, rateLimitHeaders, resolveRateLimitKey } from '@/lib/rate-limit'

const ALLOWED_TRIGGER_TYPES = new Set(['manual', 'event', 'schedule'])
const ALLOWED_WORKFLOW_TYPES = new Set(['MAINTENANCE', 'TENANT_COMMS', 'COMPLIANCE_PM', 'SLA_BREACH', 'FINANCIAL', 'COMPLIANCE_LEGAL'])

// GET /api/agent/runs — list runs (manager sees own property runs)
export async function GET(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const rate = await checkRateLimit({
    bucket: 'agent-runs-list',
    key: resolveRateLimitKey(req, session.user.id),
    limit: 120,
    windowMs: 60_000,
  })
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please retry shortly.' },
      { status: 429, headers: rateLimitHeaders(rate) }
    )
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

  return NextResponse.json(runs, { headers: rateLimitHeaders(rate) })
}

// POST /api/agent/runs — manual trigger (queued for worker execution)
export async function POST(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const rate = await checkRateLimit({
    bucket: 'agent-runs-create',
    key: resolveRateLimitKey(req, session.user.id),
    limit: 20,
    windowMs: 60_000,
  })
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please retry shortly.' },
      { status: 429, headers: rateLimitHeaders(rate) }
    )
  }
  const scopedPropertyIds = await scopedPropertyIdsForManagerViews(session)

  const body = await req.json().catch(() => ({}))
  const { propertyId, triggerType = 'manual', entityId, workflowType = 'MAINTENANCE', payload = {} } = body
  if (typeof triggerType !== 'string' || !ALLOWED_TRIGGER_TYPES.has(triggerType)) {
    return NextResponse.json({ error: 'Invalid triggerType' }, { status: 400 })
  }
  if (typeof workflowType !== 'string' || !ALLOWED_WORKFLOW_TYPES.has(workflowType)) {
    return NextResponse.json({ error: 'Invalid workflowType' }, { status: 400 })
  }
  if (!propertyId) {
    return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
  }
  if (!canAccessScopedPropertyId(scopedPropertyIds, propertyId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const runPayload: Record<string, unknown> = {
    propertyId,
    entityId: entityId ?? null,
    ...((typeof payload === 'object' && payload) ? payload : {}),
  }
  if (workflowType === 'MAINTENANCE' && !runPayload.triggerType) {
    runPayload.triggerType = 'UNASSIGNED_WO'
  }
  if (workflowType === 'TENANT_COMMS' && !runPayload.threadId) {
    runPayload.threadId = entityId ?? ''
  }
  if (workflowType === 'SLA_BREACH' && !runPayload.workOrderId) {
    runPayload.workOrderId = entityId ?? ''
  }

  const runId = await enqueueWorkflowRun({
    workflowType: workflowType as WorkflowType,
    triggerType: triggerType as 'event' | 'schedule' | 'manual' | 'inbound',
    triggerRef: `manual-${session.user.id}-${Date.now()}`,
    propertyId,
    payload: runPayload,
    maxAttempts: 5,
  })

  return NextResponse.json({ ok: true, runId }, { headers: rateLimitHeaders(rate) })
}
