import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole !== 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workOrders = await prisma.workOrder.findMany({
    where: { submittedById: session.user.id },
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true } },
      assignedVendor: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const now = new Date()
  const active: any[] = []
  const completed: any[] = []

  let breachedCount = 0
  let completedOnTime = 0
  let totalResolutionHours = 0

  for (const wo of workOrders) {
    if (wo.status === 'COMPLETED' || wo.status === 'CANCELED') {
      const resolutionMs = wo.completedAt
        ? wo.completedAt.getTime() - wo.createdAt.getTime()
        : 0
      const resolutionHours = resolutionMs / (1000 * 60 * 60)
      const metSla = wo.slaDate && wo.completedAt
        ? wo.completedAt <= wo.slaDate
        : null

      if (wo.status === 'COMPLETED') {
        totalResolutionHours += resolutionHours
        if (metSla === true) completedOnTime++
      }

      completed.push({
        id: wo.id,
        title: wo.title,
        category: wo.category,
        priority: wo.priority,
        status: wo.status,
        property: wo.property,
        unit: wo.unit,
        createdAt: wo.createdAt,
        completedAt: wo.completedAt,
        resolutionHours: Math.round(resolutionHours * 10) / 10,
        metSla,
      })
    } else {
      let timeRemainingHours: number | null = null
      let breached = false
      let urgency: 'green' | 'yellow' | 'red' = 'green'

      if (wo.slaDate) {
        const remainMs = wo.slaDate.getTime() - now.getTime()
        timeRemainingHours = Math.round((remainMs / (1000 * 60 * 60)) * 10) / 10
        breached = timeRemainingHours < 0
        if (breached) {
          urgency = 'red'
          breachedCount++
        } else if (timeRemainingHours < 4) {
          urgency = 'red'
        } else if (timeRemainingHours < 24) {
          urgency = 'yellow'
        }
      }

      active.push({
        id: wo.id,
        title: wo.title,
        category: wo.category,
        priority: wo.priority,
        status: wo.status,
        property: wo.property,
        unit: wo.unit,
        assignedVendor: wo.assignedVendor,
        createdAt: wo.createdAt,
        slaDate: wo.slaDate,
        timeRemainingHours,
        breached,
        urgency,
      })
    }
  }

  const completedWOs = completed.filter(c => c.status === 'COMPLETED')
  const onTimePct = completedWOs.length > 0
    ? Math.round((completedOnTime / completedWOs.length) * 100)
    : 100
  const avgResolutionHours = completedWOs.length > 0
    ? Math.round((totalResolutionHours / completedWOs.length) * 10) / 10
    : 0

  return NextResponse.json({
    active,
    completed,
    stats: {
      totalActive: active.length,
      breachedCount,
      onTimePct,
      avgResolutionHours,
    },
  })
}
