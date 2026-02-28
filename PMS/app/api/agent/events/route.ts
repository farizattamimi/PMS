import { NextResponse } from 'next/server'
import { validateCronSecret } from '@/lib/security'
import { makeDedupeKey, runExistsForKey } from '@/lib/agent-runtime'
import { enqueueWorkflowRun, type WorkflowType } from '@/lib/agent-orchestrator'
import type { AgentEvent } from '@/lib/agent-events'

/**
 * POST /api/agent/events
 *
 * Internal event intake. Called by publishAgentEvent() from within the app.
 * Secured by CRON_SECRET. Creates a deduplicated queued AgentRun for the
 * workflow worker to process with retries / DLQ semantics.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const provided = authHeader?.replace('Bearer ', '')
  const auth = validateCronSecret({
    cronSecret: process.env.CRON_SECRET,
    nodeEnv: process.env.NODE_ENV,
    providedSecret: provided,
  })
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const event: AgentEvent = await req.json().catch(() => ({}))
  if (!event.eventType) {
    return NextResponse.json({ error: 'eventType is required' }, { status: 400 })
  }

  // Route to correct workflow
  const routedWorkflow = routeEvent(event.eventType)
  if (!routedWorkflow) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'no workflow for event type' })
  }
  if (routedWorkflow === 'SLA_BREACH' && (!event.propertyId || !event.entityId)) {
    return NextResponse.json(
      { error: 'propertyId and entityId are required for SLA_BREACH events' },
      { status: 400 }
    )
  }
  if (routedWorkflow !== 'SLA_BREACH' && !event.propertyId) {
    return NextResponse.json(
      { error: `propertyId is required for ${routedWorkflow} events` },
      { status: 400 }
    )
  }
  const dateBucket = new Date().toISOString().slice(0, 13) // hourly bucket
  const dedupeKey = makeDedupeKey(
    'event',
    `${event.eventType}-${event.entityId ?? 'global'}`,
    event.propertyId ?? null,
    dateBucket
  )

  // Idempotency check
  const already = await runExistsForKey(dedupeKey)
  if (already) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'duplicate' })
  }

  const payload: Record<string, unknown> = {
    propertyId: event.propertyId,
    entityId: event.entityId ?? null,
  }
  if (routedWorkflow === 'MAINTENANCE') {
    payload.triggerType = mapEventToTriggerType(event.eventType)
  }
  if (routedWorkflow === 'TENANT_COMMS') {
    payload.threadId = event.entityId ?? ''
  }
  if (routedWorkflow === 'SLA_BREACH') {
    payload.workOrderId = event.entityId ?? ''
  }

  const runId = await enqueueWorkflowRun({
    workflowType: routedWorkflow,
    triggerType: 'event',
    triggerRef: dedupeKey,
    propertyId: event.propertyId,
    payload,
    maxAttempts: 5,
  })

  return NextResponse.json({ ok: true, runId, dedupeKey })
}

function routeEvent(eventType: string): WorkflowType | null {
  const maintenanceEvents = ['PM_DUE', 'NEW_INCIDENT']
  if (maintenanceEvents.includes(eventType)) return 'MAINTENANCE'
  const tenantCommsEvents = ['NEW_MESSAGE_THREAD', 'NEW_MESSAGE']
  if (tenantCommsEvents.includes(eventType)) return 'TENANT_COMMS'
  if (eventType === 'COMPLIANCE_DUE') return 'COMPLIANCE_PM'
  if (eventType === 'WO_SLA_BREACH') return 'SLA_BREACH'
  return null
}

function mapEventToTriggerType(
  eventType: string
): 'PM_DUE' | 'NEW_INCIDENT' | 'UNASSIGNED_WO' {
  if (eventType === 'PM_DUE') return 'PM_DUE'
  if (eventType === 'NEW_INCIDENT') return 'NEW_INCIDENT'
  return 'UNASSIGNED_WO' // fallback for any future MAINTENANCE events
}
