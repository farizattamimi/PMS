import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateCronSecret } from '@/lib/security'
import { publishAgentEvent } from '@/lib/agent-events'

/**
 * GET /api/cron/pm-due
 * Secured by CRON_SECRET. Finds PM schedules that are due, creates WorkOrders,
 * and advances nextDueAt by frequencyDays.
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

  const dueSchedules = await prisma.pMSchedule.findMany({
    where: {
      isActive: true,
      nextDueAt: { lte: now },
    },
    include: {
      asset: {
        include: {
          property: { select: { id: true, managerId: true } },
        },
      },
      vendor: { select: { id: true } },
    },
  })

  let created = 0

  for (const schedule of dueSchedules) {
    if (schedule.autoCreateWO) {
      await prisma.workOrder.create({
        data: {
          propertyId: schedule.asset.property.id,
          unitId: schedule.asset.unitId || null,
          submittedById: schedule.asset.property.managerId,
          assignedVendorId: schedule.vendorId || null,
          title: schedule.title,
          description: schedule.description ?? `Preventive maintenance: ${schedule.title}`,
          category: 'GENERAL',
          priority: 'LOW',
          status: schedule.vendorId ? 'ASSIGNED' : 'NEW',
        },
      })
      created++
    }

    // Publish event to autonomous agent (fire-and-forget)
    publishAgentEvent({
      eventType: 'PM_DUE',
      propertyId: schedule.asset.property.id,
      entityId: schedule.id,
      entityType: 'pm_schedule',
    })

    // Advance nextDueAt
    const nextDue = new Date(schedule.nextDueAt)
    nextDue.setDate(nextDue.getDate() + schedule.frequencyDays)

    await prisma.pMSchedule.update({
      where: { id: schedule.id },
      data: {
        lastRunAt: now,
        nextDueAt: nextDue,
      },
    })
  }

  return NextResponse.json({
    ok: true,
    processed: dueSchedules.length,
    workOrdersCreated: created,
    asOf: now.toISOString(),
  })
}
