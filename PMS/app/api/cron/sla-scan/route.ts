import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateCronSecret } from '@/lib/security'
import { publishAgentEvent } from '@/lib/agent-events'

/**
 * GET /api/cron/sla-scan
 *
 * Hourly/daily cron trigger for Workflow D (SLA Breach Autopilot).
 * Secured by CRON_SECRET. Finds all active work orders that have
 * breached their slaDate, then fires one WO_SLA_BREACH agent event
 * per work order (fire-and-forget).
 *
 * The agent event system handles deduplication (hourly bucket) so this
 * is safe to call multiple times per hour.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const authHeader = req.headers.get('authorization')
  const provided = searchParams.get('secret') ?? authHeader?.replace('Bearer ', '')

  const auth = validateCronSecret({
    cronSecret: process.env.CRON_SECRET,
    nodeEnv: process.env.NODE_ENV,
    providedSecret: provided,
  })
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const now = new Date()

  // Find all active work orders past their SLA deadline
  const breachedWOs = await prisma.workOrder.findMany({
    where: {
      slaDate: { not: null, lte: now },
      status: { notIn: ['COMPLETED', 'CANCELED'] },
    },
    select: { id: true, propertyId: true, title: true, priority: true },
  })

  // Fire one WO_SLA_BREACH event per work order (fire-and-forget)
  for (const wo of breachedWOs) {
    publishAgentEvent({
      eventType: 'WO_SLA_BREACH',
      propertyId: wo.propertyId,
      entityId: wo.id,
      entityType: 'work_order',
    })
  }

  return NextResponse.json({
    ok: true,
    workOrdersBreached: breachedWOs.length,
    asOf: now.toISOString(),
  })
}
