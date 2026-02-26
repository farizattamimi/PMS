import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateCronSecret } from '@/lib/security'
import { publishAgentEvent } from '@/lib/agent-events'

/**
 * GET /api/cron/compliance-scan
 *
 * Daily cron trigger for Workflow C (Compliance + PM Autopilot).
 * Secured by CRON_SECRET. Finds all properties that have compliance items
 * due within the next 30 days or already overdue, then fires one
 * COMPLIANCE_DUE agent event per property (fire-and-forget).
 *
 * The agent event system handles deduplication (hourly bucket) so this
 * is safe to call multiple times per day.
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
  const in30 = new Date(now)
  in30.setDate(in30.getDate() + 30)

  // Find distinct propertyIds with pending/overdue compliance items
  const affectedItems = await prisma.complianceItem.findMany({
    where: {
      status: { in: ['PENDING', 'OVERDUE'] },
      dueDate: { lte: in30 },
    },
    select: { propertyId: true },
    distinct: ['propertyId'],
  })

  const propertyIds = affectedItems.map((i) => i.propertyId)

  // Fire one COMPLIANCE_DUE event per property (fire-and-forget)
  for (const propertyId of propertyIds) {
    publishAgentEvent({
      eventType: 'COMPLIANCE_DUE',
      propertyId,
      entityId: propertyId, // scan is property-scoped
      entityType: 'property',
    })
  }

  return NextResponse.json({
    ok: true,
    propertiesQueued: propertyIds.length,
    asOf: now.toISOString(),
  })
}
