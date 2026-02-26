import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId') ?? ''
  const months = Math.min(parseInt(searchParams.get('months') ?? '12'), 24)

  const propertyFilter = propertyId
    ? { id: propertyId }
    : session.user.systemRole === 'MANAGER'
    ? { managerId: session.user.id }
    : {}

  const properties = await prisma.property.findMany({
    where: propertyFilter,
    select: { id: true, name: true },
  })

  const since = new Date()
  since.setMonth(since.getMonth() - months)

  // Get all ACTIVE and ENDED leases for units in scope, ordered by unit + startDate
  const leases = await prisma.lease.findMany({
    where: {
      property: propertyFilter,
      status: { in: ['ACTIVE', 'ENDED'] },
    },
    select: {
      id: true,
      unitId: true,
      propertyId: true,
      startDate: true,
      endDate: true,
      status: true,
    },
    orderBy: [{ unitId: 'asc' }, { startDate: 'asc' }],
  })

  // Calculate days-to-fill per vacancy gap
  type Gap = { propertyId: string; days: number; month: string }
  const gaps: Gap[] = []

  const unitIds = Array.from(new Set(leases.map(l => l.unitId)))
  for (const unitId of unitIds) {
    const unitLeases = leases.filter(l => l.unitId === unitId)
    for (let i = 1; i < unitLeases.length; i++) {
      const prev = unitLeases[i - 1]
      const curr = unitLeases[i]
      if (!prev.endDate) continue
      const prevEnd = new Date(prev.endDate)
      const currStart = new Date(curr.startDate)
      const days = Math.round((currStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60 * 24))
      if (days <= 0) continue
      // Use the month the gap ended (when new lease started)
      const month = currStart.toISOString().slice(0, 7)
      if (currStart >= since) {
        gaps.push({ propertyId: prev.propertyId ?? curr.propertyId ?? '', days, month })
      }
    }
  }

  // By property
  const byProperty = properties.map(p => {
    const pGaps = gaps.filter(g => g.propertyId === p.id)
    const avgDaysToFill = pGaps.length > 0
      ? Math.round(pGaps.reduce((s, g) => s + g.days, 0) / pGaps.length)
      : null
    return { id: p.id, name: p.name, avgDaysToFill, count: pGaps.length }
  })

  // By month (last N months)
  const monthMap = new Map<string, number[]>()
  for (const g of gaps) {
    if (!monthMap.has(g.month)) monthMap.set(g.month, [])
    monthMap.get(g.month)!.push(g.days)
  }

  // Build ordered month labels
  const monthLabels: string[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    monthLabels.push(d.toISOString().slice(0, 7))
  }

  const byMonth = monthLabels.map(month => {
    const days = monthMap.get(month) ?? []
    const avgDaysToFill = days.length > 0
      ? Math.round(days.reduce((s, d) => s + d, 0) / days.length)
      : null
    return { month, avgDaysToFill, count: days.length }
  })

  const allDays = gaps.map(g => g.days)
  const avgDaysToFill = allDays.length > 0
    ? Math.round(allDays.reduce((s, d) => s + d, 0) / allDays.length)
    : null

  return NextResponse.json({ avgDaysToFill, byProperty, byMonth })
}
