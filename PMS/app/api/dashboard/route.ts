import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { orgScopeWhere } from '@/lib/access'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
  const in60DaysVendor = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const propertyFilter = session.user.systemRole === 'MANAGER'
    ? { managerId: session.user.id }
    : { ...orgScopeWhere(session) }

  const [
    totalUnits,
    occupiedUnits,
    openWorkOrders,
    expiringLeases30,
    expiringLeases60,
    recentLedger,
    urgentWorkOrders,
    properties,
    longVacantUnits,
    staleWorkOrders,
    pastSlaIncidents,
    expiringVendorCreds,
    overdueComplianceItems,
    dueSoonComplianceItems,
  ] = await Promise.all([
    prisma.unit.count({ where: { property: propertyFilter } }),
    prisma.unit.count({ where: { status: 'OCCUPIED', property: propertyFilter } }),
    prisma.workOrder.count({ where: { status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS'] }, property: propertyFilter } }),
    prisma.lease.count({ where: { status: 'ACTIVE', endDate: { gte: now, lte: in30Days }, unit: { property: propertyFilter } } }),
    prisma.lease.count({ where: { status: 'ACTIVE', endDate: { gte: now, lte: in60Days }, unit: { property: propertyFilter } } }),
    prisma.ledgerEntry.findMany({
      where: { property: propertyFilter },
      orderBy: { effectiveDate: 'desc' },
      take: 10,
      include: {
        lease: { include: { tenant: { include: { user: { select: { name: true } } } } } },
        property: { select: { name: true } },
      },
    }),
    prisma.workOrder.findMany({
      where: {
        status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS'] },
        priority: { in: ['HIGH', 'EMERGENCY'] },
        property: propertyFilter,
      },
      include: {
        property: { select: { name: true } },
        unit: { select: { unitNumber: true } },
        submittedBy: { select: { name: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 5,
    }),
    prisma.property.findMany({
      where: propertyFilter,
      include: {
        units: { select: { status: true } },
        _count: { select: { workOrders: true } },
      },
      orderBy: { name: 'asc' },
    }),
    // Units vacant > 30 days
    prisma.unit.count({
      where: {
        status: 'AVAILABLE',
        property: propertyFilter,
        updatedAt: { lte: in30Days },
      },
    }),
    // Work orders open > 7 days without update
    prisma.workOrder.count({
      where: {
        status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS'] },
        property: propertyFilter,
        updatedAt: { lte: sevenDaysAgo },
      },
    }),
    // Incidents past SLA deadline
    prisma.incident.count({
      where: {
        status: { in: ['OPEN', 'IN_REVIEW'] },
        slaDeadline: { lt: now },
        property: propertyFilter,
      },
    }),
    // Vendor credentials expiring < 60 days
    prisma.vendor.count({
      where: {
        status: 'ACTIVE',
        OR: [
          { licenseExpiry: { gte: now, lte: in60DaysVendor } },
          { insuranceExpiry: { gte: now, lte: in60DaysVendor } },
        ],
        propertyVendors: { some: { property: propertyFilter } },
      },
    }),
    // Overdue compliance items
    prisma.complianceItem.count({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
        dueDate: { lt: now },
        property: propertyFilter,
      },
    }),
    // Compliance items due in < 30 days
    prisma.complianceItem.count({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueDate: { gte: now, lte: in30Days },
        property: propertyFilter,
      },
    }),
  ])

  const propertyStats = properties.map(p => {
    const total = p.units.length
    const occupied = p.units.filter(u => u.status === 'OCCUPIED').length
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      totalUnits: total,
      occupiedUnits: occupied,
      occupancyRate: total > 0 ? Math.round((occupied / total) * 100) : 0,
      openWorkOrders: p._count.workOrders,
    }
  })

  const exceptions: { type: string; label: string; count: number; href: string; severity: 'warning' | 'danger' }[] = []
  if (expiringLeases30 > 0) exceptions.push({ type: 'leases', label: `${expiringLeases30} lease${expiringLeases30 > 1 ? 's' : ''} expiring in 30 days`, count: expiringLeases30, href: '/dashboard/reporting', severity: 'danger' })
  if (staleWorkOrders > 0) exceptions.push({ type: 'workorders', label: `${staleWorkOrders} work order${staleWorkOrders > 1 ? 's' : ''} stale for 7+ days`, count: staleWorkOrders, href: '/dashboard/workorders', severity: 'warning' })
  if (pastSlaIncidents > 0) exceptions.push({ type: 'incidents', label: `${pastSlaIncidents} incident${pastSlaIncidents > 1 ? 's' : ''} past SLA deadline`, count: pastSlaIncidents, href: '/dashboard/incidents', severity: 'danger' })
  if (longVacantUnits > 0) exceptions.push({ type: 'vacancy', label: `${longVacantUnits} unit${longVacantUnits > 1 ? 's' : ''} vacant 30+ days`, count: longVacantUnits, href: '/dashboard/reporting/vacancy', severity: 'warning' })
  if (expiringVendorCreds > 0) exceptions.push({ type: 'vendors', label: `${expiringVendorCreds} vendor${expiringVendorCreds > 1 ? 's' : ''} with expiring credentials`, count: expiringVendorCreds, href: '/dashboard/vendors', severity: 'warning' })
  if (overdueComplianceItems > 0) exceptions.push({ type: 'compliance', label: `${overdueComplianceItems} compliance item${overdueComplianceItems > 1 ? 's' : ''} overdue`, count: overdueComplianceItems, href: '/dashboard/compliance', severity: 'danger' })
  if (dueSoonComplianceItems > 0) exceptions.push({ type: 'compliance_soon', label: `${dueSoonComplianceItems} compliance item${dueSoonComplianceItems > 1 ? 's' : ''} due in 30 days`, count: dueSoonComplianceItems, href: '/dashboard/compliance', severity: 'warning' })

  return NextResponse.json({
    stats: {
      totalUnits,
      occupiedUnits,
      vacantUnits: totalUnits - occupiedUnits,
      occupancyRate: totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0,
      openWorkOrders,
      expiringLeases30,
      expiringLeases60,
    },
    recentLedger,
    urgentWorkOrders,
    properties: propertyStats,
    exceptions,
  })
}
