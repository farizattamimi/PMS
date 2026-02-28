import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId') // omit for portfolio
  const month = searchParams.get('month') // YYYY-MM

  if (!month) return NextResponse.json({ error: 'month is required' }, { status: 400 })

  const start = new Date(`${month}-01`)
  const end = new Date(start)
  end.setMonth(end.getMonth() + 1)

  const now = new Date()
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
  const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

  // Scope: single property or portfolio
  const propFilter = session.user.systemRole === 'MANAGER'
    ? propertyId
      ? { id: propertyId, managerId: session.user.id }
      : { managerId: session.user.id }
    : propertyId
      ? { id: propertyId }
      : {}

  const properties = await prisma.property.findMany({
    where: propFilter,
    select: { id: true, name: true, address: true, city: true, state: true },
  })

  if (properties.length === 0) return NextResponse.json({ error: 'No properties found' }, { status: 404 })


  const propIds = properties.map(p => p.id)

  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  const [units, leases, ledgerEntries, workOrders, workOrderCosts, completedWOs] = await Promise.all([
    prisma.unit.findMany({
      where: { propertyId: { in: propIds } },
      select: { id: true, propertyId: true, status: true, monthlyRent: true },
    }),
    prisma.lease.findMany({
      where: { propertyId: { in: propIds } },
      select: { id: true, propertyId: true, status: true, endDate: true, monthlyRent: true, tenant: { include: { user: { select: { name: true } } } }, unit: { select: { unitNumber: true } } },
    }),
    prisma.ledgerEntry.findMany({
      where: { propertyId: { in: propIds }, effectiveDate: { gte: start, lt: end } },
      select: { id: true, propertyId: true, type: true, amount: true, effectiveDate: true, memo: true },
    }),
    prisma.workOrder.findMany({
      where: { propertyId: { in: propIds }, createdAt: { gte: start, lt: end } },
      select: { id: true, propertyId: true, status: true, category: true, priority: true, assignedVendorId: true, assignedVendor: { select: { id: true, name: true } } },
    }),
    prisma.workOrderCost.findMany({
      where: { workOrder: { propertyId: { in: propIds }, createdAt: { gte: start, lt: end } } },
      select: { workOrderId: true, amount: true, workOrder: { select: { assignedVendorId: true, assignedVendor: { select: { id: true, name: true } } } } },
    }),
    // Completed WOs (all time for repeat repair analysis)
    prisma.workOrder.findMany({
      where: { propertyId: { in: propIds }, status: 'COMPLETED', completedAt: { gte: ninetyDaysAgo } },
      select: { id: true, propertyId: true, unitId: true, category: true, completedAt: true, createdAt: true },
    }),
  ])

  // ── Aggregate ──
  const totalUnits = units.length
  const occupiedUnits = units.filter(u => u.status === 'OCCUPIED').length
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0

  const income = ledgerEntries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0)
  const expenses = ledgerEntries.filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)
  const noi = income - expenses

  const activeLeases = leases.filter(l => l.status === 'ACTIVE')
  const expiring30 = activeLeases.filter(l => new Date(l.endDate) >= now && new Date(l.endDate) <= in30)
  const expiring60 = activeLeases.filter(l => new Date(l.endDate) > in30 && new Date(l.endDate) <= in60)
  const expiring90 = activeLeases.filter(l => new Date(l.endDate) > in60 && new Date(l.endDate) <= in90)

  // Vendor spend summary
  const vendorSpend = new Map<string, { name: string; spend: number; count: number }>()
  for (const cost of workOrderCosts) {
    const vendor = cost.workOrder?.assignedVendor
    if (!vendor) continue
    const existing = vendorSpend.get(vendor.id) ?? { name: vendor.name, spend: 0, count: 0 }
    existing.spend += cost.amount
    existing.count += 1
    vendorSpend.set(vendor.id, existing)
  }
  const topVendors = Array.from(vendorSpend.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10)

  // Per-property breakdown (for portfolio mode)
  const propertyBreakdown = properties.map(p => {
    const pUnits = units.filter(u => u.propertyId === p.id)
    const pOccupied = pUnits.filter(u => u.status === 'OCCUPIED').length
    const pOccRate = pUnits.length > 0 ? Math.round((pOccupied / pUnits.length) * 100) : 0
    const pLedger = ledgerEntries.filter(e => e.propertyId === p.id)
    const pIncome = pLedger.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0)
    const pExpenses = pLedger.filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)
    const pOpenWOs = workOrders.filter(w => w.propertyId === p.id && !['COMPLETED', 'CANCELED'].includes(w.status)).length
    return {
      ...p,
      units: pUnits.length,
      occupied: pOccupied,
      occupancyRate: pOccRate,
      noi: pIncome - pExpenses,
      openWorkOrders: pOpenWOs,
    }
  })

  // ── WO Analytics ──
  const categoryResolution: Record<string, { total: number; count: number }> = {}
  for (const wo of completedWOs) {
    if (!wo.completedAt) continue
    const hours = Math.round((new Date(wo.completedAt).getTime() - new Date(wo.createdAt).getTime()) / (1000 * 60 * 60))
    const cat = wo.category as string
    if (!categoryResolution[cat]) categoryResolution[cat] = { total: 0, count: 0 }
    categoryResolution[cat].total += hours
    categoryResolution[cat].count += 1
  }
  const avgResolutionByCategory = Object.entries(categoryResolution).map(([category, { total, count }]) => ({
    category,
    avgHours: count > 0 ? Math.round(total / count) : 0,
    count,
  }))

  const unitCategoryMap = new Map<string, number>()
  for (const wo of completedWOs) {
    if (!wo.unitId) continue
    const key = `${wo.unitId}:${wo.category}`
    unitCategoryMap.set(key, (unitCategoryMap.get(key) ?? 0) + 1)
  }
  const repeatRepairCount = Array.from(unitCategoryMap.values()).filter(v => v > 1).length

  return NextResponse.json({
    isPortfolio: !propertyId,
    properties: propertyBreakdown,
    property: propertyId ? properties[0] : null,
    month,
    period: { start: start.toISOString(), end: end.toISOString() },
    occupancy: { total: totalUnits, occupied: occupiedUnits, rate: occupancyRate },
    financials: { income, expenses, noi, ledgerEntries },
    workOrders: {
      total: workOrders.length,
      byStatus: {
        NEW: workOrders.filter(w => w.status === 'NEW').length,
        ASSIGNED: workOrders.filter(w => w.status === 'ASSIGNED').length,
        IN_PROGRESS: workOrders.filter(w => w.status === 'IN_PROGRESS').length,
        BLOCKED: workOrders.filter(w => w.status === 'BLOCKED').length,
        COMPLETED: workOrders.filter(w => w.status === 'COMPLETED').length,
        CANCELED: workOrders.filter(w => w.status === 'CANCELED').length,
      },
      byCategory: Object.fromEntries(
        ['PLUMBING', 'HVAC', 'ELECTRICAL', 'GENERAL', 'TURNOVER', 'OTHER'].map(cat => [
          cat, workOrders.filter(w => w.category === cat).length
        ])
      ),
      analytics: { avgResolutionByCategory, repeatRepairCount },
    },
    leases: {
      active: activeLeases.length,
      expiring30: expiring30.length,
      expiring60: expiring60.length,
      expiring90: expiring90.length,
      expiringList: [
        ...expiring30.map(l => ({ ...l, bucket: '30' })),
        ...expiring60.map(l => ({ ...l, bucket: '60' })),
        ...expiring90.map(l => ({ ...l, bucket: '90' })),
      ],
    },
    vendors: { topBySpend: topVendors },
  })
}
