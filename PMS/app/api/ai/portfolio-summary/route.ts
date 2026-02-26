import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { anthropic, AI_MODEL, streamResponse } from '@/lib/ai'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.systemRole !== 'MANAGER' && session.user.systemRole !== 'ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  const { propertyId } = await req.json()

  const propertyFilter = propertyId ? { propertyId } : {}

  // Property and unit counts
  const [properties, totalUnits, occupiedUnits] = await Promise.all([
    prisma.property.count(propertyId ? { where: { id: propertyId } } : undefined),
    prisma.unit.count({ where: { ...propertyFilter } }),
    prisma.unit.count({ where: { ...propertyFilter, status: 'OCCUPIED' } }),
  ])

  // Open WOs by priority
  const openWOs = await prisma.workOrder.groupBy({
    by: ['priority'],
    where: { ...propertyFilter, status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED'] } },
    _count: { id: true },
  })

  // Leases expiring ≤30 days
  const now = new Date()
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const expiringLeases = await prisma.lease.count({
    where: {
      status: 'ACTIVE',
      endDate: { lte: in30 },
      ...(propertyId ? { unit: { propertyId } } : {}),
    },
  })

  // Active incidents
  const activeIncidents = await prisma.incident.count({
    where: { ...propertyFilter, status: { in: ['OPEN', 'IN_REVIEW'] } },
  })

  // Overdue compliance items
  const overdueCompliance = await prisma.complianceItem.count({
    where: { ...propertyFilter, status: 'OVERDUE' },
  })

  // Last 30-day NOI from ledger
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const ledgerEntries = await prisma.ledgerEntry.findMany({
    where: {
      effectiveDate: { gte: thirtyDaysAgo },
      ...(propertyId ? { propertyId } : {}),
    },
    select: { amount: true },
  })
  const noi = ledgerEntries.reduce((sum, e) => sum + e.amount, 0)

  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0

  const woByPriority = openWOs.reduce<Record<string, number>>((acc, row) => {
    acc[row.priority] = row._count.id
    return acc
  }, {})

  const context = `Portfolio Summary Data:
- Properties: ${properties}
- Total Units: ${totalUnits}
- Occupied Units: ${occupiedUnits} (${occupancyRate}% occupancy)
- Open Work Orders: ${JSON.stringify(woByPriority)} (by priority)
- Leases Expiring ≤30 Days: ${expiringLeases}
- Active Incidents: ${activeIncidents}
- Overdue Compliance Items: ${overdueCompliance}
- Last 30-Day NOI: $${noi.toFixed(2)}`

  const stream = anthropic.messages.stream({
    model: AI_MODEL,
    max_tokens: 600,
    system: `Property management analyst. Write a 2-3 paragraph executive summary highlighting what's working, key concerns, and 1-2 recommendations. Under 250 words. No headers.`,
    messages: [{ role: 'user', content: context }],
  })

  return streamResponse(stream)
}
