import { NextResponse } from 'next/server'
import { validateCronSecret } from '@/lib/security'
import { createRun, makeDedupeKey, runExistsForKey } from '@/lib/agent-runtime'
import { runMaintenanceAutopilot } from '@/lib/workflows/maintenance-autopilot'
import { runTenantCommsAutopilot } from '@/lib/workflows/tenant-comms-autopilot'
import { runCompliancePMAutopilot } from '@/lib/workflows/compliance-pm-autopilot'
import { runSLABreachAutopilot } from '@/lib/workflows/sla-breach-autopilot'
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

  if (routedWorkflow === 'TENANT_COMMS' && event.propertyId) {
    runTenantCommsAutopilot({
      runId,
      propertyId: event.propertyId,
      threadId: event.entityId ?? '',
    }).catch((err: Error) => {
      console.error('[agent/events] TenantComms workflow error:', err.message)
    })
  }

  if (routedWorkflow === 'COMPLIANCE_PM' && event.propertyId) {
    runCompliancePMAutopilot({
      runId,
      propertyId: event.propertyId,
    }).catch((err: Error) => {
      console.error('[agent/events] CompliancePM workflow error:', err.message)
    })
  }

  if (routedWorkflow === 'SLA_BREACH' && event.propertyId && event.entityId) {
    runSLABreachAutopilot({
      runId,
      propertyId: event.propertyId,
      workOrderId: event.entityId,
    }).catch((err: Error) => {
      console.error('[agent/events] SLABreach workflow error:', err.message)
    })
  }

  return NextResponse.json({ ok: true, runId, dedupeKey })
}

type WorkflowType = 'MAINTENANCE' | 'TENANT_COMMS' | 'COMPLIANCE_PM' | 'SLA_BREACH'

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
