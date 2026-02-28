import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const propertyFilter = session.user.systemRole === 'MANAGER'
    ? { managerId: session.user.id }
    : {}

  const now = new Date()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  const [properties, allUnits, allLeases, allWorkOrders, allWOCosts, allIncidents] = await Promise.all([
    prisma.property.findMany({
      where: propertyFilter,
      select: { id: true, name: true },
    }),
    prisma.unit.findMany({
      where: { property: propertyFilter },
      select: { id: true, propertyId: true, status: true, sqFt: true, monthlyRent: true },
    }),
    prisma.lease.findMany({
      where: { property: propertyFilter, status: { in: ['ACTIVE', 'ENDED'] } },
      select: { id: true, propertyId: true, unitId: true, startDate: true, endDate: true, status: true },
    }),
    prisma.workOrder.findMany({
      where: { property: propertyFilter, completedAt: { gte: ninetyDaysAgo } },
      select: { id: true, propertyId: true, createdAt: true, completedAt: true, status: true },
    }),
    prisma.workOrderCost.findMany({
      where: { workOrder: { property: propertyFilter, createdAt: { gte: ninetyDaysAgo } } },
      select: { amount: true, workOrder: { select: { propertyId: true } } },
    }),
    prisma.incident.findMany({
      where: { property: propertyFilter, status: { in: ['OPEN', 'IN_REVIEW'] } },
      select: { id: true, propertyId: true },
    }),
  ])

  const metrics = properties.map(prop => {
    const units = allUnits.filter(u => u.propertyId === prop.id)
    const totalUnits = units.length
    const occupiedUnits = units.filter(u => u.status === 'OCCUPIED').length
    const occupancyPct = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0

    // Avg days to fill vacancy: time between ended lease endDate and next active lease startDate on same unit
    const endedLeases = allLeases.filter(l => l.propertyId === prop.id && l.status === 'ENDED')
    const activeLeases = allLeases.filter(l => l.propertyId === prop.id && l.status === 'ACTIVE')
    let totalVacancyDays = 0
    let vacancyCount = 0
    for (const ended of endedLeases) {
      const next = activeLeases.find(a => a.unitId === ended.unitId && new Date(a.startDate) > new Date(ended.endDate))
      if (next) {
        const days = Math.round((new Date(next.startDate).getTime() - new Date(ended.endDate).getTime()) / (1000 * 60 * 60 * 24))
        if (days >= 0) { totalVacancyDays += days; vacancyCount++ }
      }
    }
    const avgDaysToFill = vacancyCount > 0 ? Math.round(totalVacancyDays / vacancyCount) : null

    // Avg WO resolution time (hours, last 90 days)
    const completedWOs = allWorkOrders.filter(w => w.propertyId === prop.id && w.completedAt)
    const totalResHours = completedWOs.reduce((s, w) => {
      return s + Math.round((new Date(w.completedAt!).getTime() - new Date(w.createdAt).getTime()) / (1000 * 60 * 60))
    }, 0)
    const avgWOResolutionHours = completedWOs.length > 0 ? Math.round(totalResHours / completedWOs.length) : null

    // Rent per sqft (occupied units)
    const occupiedUnitObjs = units.filter(u => u.status === 'OCCUPIED' && u.sqFt > 0)
    const rentPerSqFt = occupiedUnitObjs.length > 0
      ? Math.round((occupiedUnitObjs.reduce((s, u) => s + u.monthlyRent / u.sqFt, 0) / occupiedUnitObjs.length) * 100) / 100
      : null

    // Maintenance cost per unit (last 90 days)
    const propCosts = allWOCosts.filter(c => c.workOrder?.propertyId === prop.id)
    const totalCost = propCosts.reduce((s, c) => s + c.amount, 0)
    const maintenanceCostPerUnit = totalUnits > 0 ? Math.round(totalCost / totalUnits) : 0

    // Open incidents
    const openIncidents = allIncidents.filter(i => i.propertyId === prop.id).length

    return {
      propertyId: prop.id,
      propertyName: prop.name,
      occupancyPct,
      totalUnits,
      occupiedUnits,
      avgDaysToFill,
      avgWOResolutionHours,
      rentPerSqFt,
      maintenanceCostPerUnit,
      openIncidents,
    }
  })

  // Portfolio averages (exclude nulls)
  function avg(vals: (number | null)[]) {
    const nums = vals.filter((v): v is number => v !== null)
    return nums.length > 0 ? Math.round(nums.reduce((s, v) => s + v, 0) / nums.length) : null
  }

  const portfolio = {
    occupancyPct: avg(metrics.map(m => m.occupancyPct)),
    avgDaysToFill: avg(metrics.map(m => m.avgDaysToFill)),
    avgWOResolutionHours: avg(metrics.map(m => m.avgWOResolutionHours)),
    rentPerSqFt: metrics.filter(m => m.rentPerSqFt !== null).length > 0
      ? Math.round(metrics.filter(m => m.rentPerSqFt !== null).reduce((s, m) => s + (m.rentPerSqFt ?? 0), 0) / metrics.filter(m => m.rentPerSqFt !== null).length * 100) / 100
      : null,
    maintenanceCostPerUnit: avg(metrics.map(m => m.maintenanceCostPerUnit)),
    openIncidents: metrics.reduce((s, m) => s + m.openIncidents, 0),
  }

  return NextResponse.json({ properties: metrics, portfolio })
}
