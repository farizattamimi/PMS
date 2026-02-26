// lib/agent-events.ts
// Fire-and-forget event publisher for the autonomous agent system.
// Callers should NOT await — this publishes asynchronously so it never
// blocks the request that triggered the event.

export type AgentEventType =
  | 'PM_DUE'
  | 'NEW_INCIDENT'
  | 'NEW_MESSAGE_THREAD'
  | 'COMPLIANCE_DUE'
  | 'WO_SLA_BREACH'
  | 'LEASE_EXPIRING'

export interface AgentEvent {
  eventType: AgentEventType
  propertyId?: string
  entityId?: string       // e.g. PMScheduleId, IncidentId, ThreadId
  entityType?: string     // e.g. "pm_schedule", "incident", "message_thread"
  payload?: Record<string, unknown>
}

/**
 * Publish an agent event. Fire-and-forget — do NOT await.
 * Routes to /api/agent/events which creates & executes the appropriate workflow.
 */
export function publishAgentEvent(event: AgentEvent): void {
  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const cronSecret = process.env.CRON_SECRET ?? ''

  // Intentionally not awaited
  fetch(`${baseUrl}/api/agent/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
    },
    body: JSON.stringify(event),
  }).catch((err: Error) => {
    console.error('[AgentEvents] Failed to publish event:', event.eventType, err.message)
  })
}
