import { NextResponse } from 'next/server'
import { validateCronSecret } from '@/lib/security'
import { createRun, makeDedupeKey, runExistsForKey } from '@/lib/agent-runtime'
import { runMaintenanceAutopilot } from '@/lib/workflows/maintenance-autopilot'
import type { AgentEvent } from '@/lib/agent-events'

/**
 * POST /api/agent/events
 *
 * Internal event intake. Called by publishAgentEvent() from within the app.
 * Secured by CRON_SECRET. Creates a deduplicated AgentRun and dispatches
 * the appropriate workflow.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const provided = authHeader?.replace('Bearer ', '')
  const auth = validateCronSecret({
    cronSecret: process.env.CRON_SECRET,
    nodeEnv: process.env.NODE_ENV,
    providedSecret: provided,
  })
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const event: AgentEvent = await req.json().catch(() => ({}))
  if (!event.eventType) {
    return NextResponse.json({ error: 'eventType is required' }, { status: 400 })
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

  // Route to correct workflow
  const routedWorkflow = routeEvent(event.eventType)
  if (!routedWorkflow) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'no workflow for event type' })
  }

  const runId = await createRun({
    triggerType: 'event',
    triggerRef: dedupeKey,
    propertyId: event.propertyId,
  })

  // Dispatch asynchronously (fire-and-forget from API response perspective)
  if (routedWorkflow === 'MAINTENANCE' && event.propertyId) {
    runMaintenanceAutopilot({
      runId,
      propertyId: event.propertyId,
      triggerType: mapEventToTriggerType(event.eventType),
      entityId: event.entityId ?? runId,
    }).catch((err: Error) => {
      console.error('[agent/events] Workflow error:', err.message)
    })
  }

  return NextResponse.json({ ok: true, runId, dedupeKey })
}

type WorkflowType = 'MAINTENANCE'

function routeEvent(eventType: string): WorkflowType | null {
  const maintenanceEvents = ['PM_DUE', 'NEW_INCIDENT', 'WO_SLA_BREACH']
  if (maintenanceEvents.includes(eventType)) return 'MAINTENANCE'
  return null
}

function mapEventToTriggerType(
  eventType: string
): 'PM_DUE' | 'NEW_INCIDENT' | 'UNASSIGNED_WO' {
  if (eventType === 'PM_DUE') return 'PM_DUE'
  if (eventType === 'NEW_INCIDENT') return 'NEW_INCIDENT'
  return 'UNASSIGNED_WO'
}
