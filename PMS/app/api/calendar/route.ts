import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export type CalendarEventType = 'PM' | 'COMPLIANCE' | 'LEASE_RENEWAL' | 'INSPECTION'

export interface CalendarEvent {
  id: string
  date: string          // YYYY-MM-DD
  type: CalendarEventType
  title: string
  propertyId: string
  propertyName: string
  status: string
  href: string
}

/**
 * GET /api/calendar
 *
 * Returns all scheduled events in the given date range across four categories:
 * PM schedules, compliance due dates, lease expirations, and inspections.
 *
 * Query params:
 *   start      — ISO date string, start of range (inclusive)
 *   end        — ISO date string, end of range (inclusive)
 *   propertyId — filter to one property (optional)
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const startStr   = searchParams.get('start')
  const endStr     = searchParams.get('end')
  const propertyId = searchParams.get('propertyId') ?? undefined

  if (!startStr || !endStr) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 })
  }

  const start = new Date(startStr)
  const end   = new Date(endStr)
  end.setHours(23, 59, 59, 999)

  // Manager scope
  const managerFilter = session.user.systemRole === 'MANAGER'
    ? { managerId: session.user.id }
    : {}

  const propFilter = propertyId ? { id: propertyId, ...managerFilter } : managerFilter

  // Resolve allowed propertyIds for this manager
  const allowedProperties = await prisma.property.findMany({
    where: propFilter,
    select: { id: true, name: true },
  })
  const allowedIds = new Set(allowedProperties.map(p => p.id))
  const propNameMap = new Map(allowedProperties.map(p => [p.id, p.name]))

  const events: CalendarEvent[] = []

  // ── PM Schedules ──────────────────────────────────────────────────────────
  const pmSchedules = await prisma.pMSchedule.findMany({
    where: {
      isActive: true,
      nextDueAt: { gte: start, lte: end },
      asset: { propertyId: propertyId ?? { in: Array.from(allowedIds) } },
    },
    include: {
      asset: { select: { propertyId: true } },
    },
  })

  for (const pm of pmSchedules) {
    const pid = pm.asset.propertyId
    if (!allowedIds.has(pid)) continue
    events.push({
      id:           `pm-${pm.id}`,
      date:         pm.nextDueAt.toISOString().slice(0, 10),
      type:         'PM',
      title:        pm.title,
      propertyId:   pid,
      propertyName: propNameMap.get(pid) ?? pid,
      status:       pm.isActive ? 'ACTIVE' : 'INACTIVE',
      href:         '/dashboard/properties',
    })
  }

  // ── Compliance Items ───────────────────────────────────────────────────────
  const complianceItems = await prisma.complianceItem.findMany({
    where: {
      status:     { in: ['PENDING', 'OVERDUE'] },
      dueDate:    { gte: start, lte: end },
      propertyId: propertyId ?? { in: Array.from(allowedIds) },
    },
    select: { id: true, title: true, propertyId: true, dueDate: true, status: true, category: true },
  })

  for (const ci of complianceItems) {
    if (!allowedIds.has(ci.propertyId)) continue
    events.push({
      id:           `compliance-${ci.id}`,
      date:         ci.dueDate.toISOString().slice(0, 10),
      type:         'COMPLIANCE',
      title:        `${ci.title} (${ci.category.replace(/_/g, ' ')})`,
      propertyId:   ci.propertyId,
      propertyName: propNameMap.get(ci.propertyId) ?? ci.propertyId,
      status:       ci.status,
      href:         '/dashboard/compliance',
    })
  }

  // ── Lease Expirations ──────────────────────────────────────────────────────
  const leases = await prisma.lease.findMany({
    where: {
      status:     { in: ['ACTIVE', 'DRAFT'] },
      endDate:    { gte: start, lte: end },
      propertyId: propertyId ?? { in: Array.from(allowedIds) },
    },
    include: {
      unit:   { select: { unitNumber: true } },
      tenant: { include: { user: { select: { name: true } } } },
    },
  })

  for (const lease of leases) {
    const pid = lease.propertyId
    if (!pid || !allowedIds.has(pid)) continue
    events.push({
      id:           `lease-${lease.id}`,
      date:         lease.endDate.toISOString().slice(0, 10),
      type:         'LEASE_RENEWAL',
      title:        `Lease expiring — ${lease.tenant.user.name ?? 'Tenant'} (${lease.unit.unitNumber})`,
      propertyId:   pid,
      propertyName: propNameMap.get(pid) ?? pid,
      status:       lease.status,
      href:         '/dashboard/reporting/rent-roll',
    })
  }

  // ── Inspections ────────────────────────────────────────────────────────────
  const inspections = await prisma.inspection.findMany({
    where: {
      status:     { in: ['SCHEDULED', 'IN_PROGRESS'] },
      scheduledAt: { gte: start, lte: end },
      propertyId: propertyId ?? { in: Array.from(allowedIds) },
    },
    select: { id: true, type: true, status: true, scheduledAt: true, propertyId: true, notes: true },
  })

  for (const insp of inspections) {
    if (!allowedIds.has(insp.propertyId)) continue
    events.push({
      id:           `inspection-${insp.id}`,
      date:         insp.scheduledAt.toISOString().slice(0, 10),
      type:         'INSPECTION',
      title:        `${insp.type.replace(/_/g, ' ')} Inspection`,
      propertyId:   insp.propertyId,
      propertyName: propNameMap.get(insp.propertyId) ?? insp.propertyId,
      status:       insp.status,
      href:         `/dashboard/inspections`,
    })
  }

  // Sort by date
  events.sort((a, b) => a.date.localeCompare(b.date))

  return NextResponse.json({
    events,
    properties: allowedProperties,
    range: { start: startStr, end: endStr },
  })
}
