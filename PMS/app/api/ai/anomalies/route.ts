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
  const leasePropertyFilter = propertyId ? { unit: { propertyId } } : {}

  // Vacancy: units not OCCUPIED
  const vacantCount = await prisma.unit.count({
    where: { ...propertyFilter, status: { not: 'OCCUPIED' } },
  })
  const totalUnits = await prisma.unit.count({ where: propertyFilter })

  // WO open-age avg (days open)
  const openWOs = await prisma.workOrder.findMany({
    where: { ...propertyFilter, status: { notIn: ['COMPLETED', 'CANCELED'] } },
    select: { createdAt: true },
  })
  const avgOpenDays = openWOs.length > 0
    ? Math.round(openWOs.reduce((s, w) => s + (Date.now() - w.createdAt.getTime()) / 86400000, 0) / openWOs.length)
    : 0

  // Last 3-month NOI trend (per month)
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const ledger = await prisma.ledgerEntry.findMany({
    where: {
      ...(propertyId ? {
        OR: [
          { propertyId },
          { lease: { unit: { propertyId } } },
        ]
      } : {}),
      effectiveDate: { gte: threeMonthsAgo },
    },
    select: { amount: true, effectiveDate: true },
  })

  const noiByMonth: Record<string, number> = {}
  for (const entry of ledger) {
    const month = entry.effectiveDate.toISOString().slice(0, 7)
    noiByMonth[month] = (noiByMonth[month] ?? 0) + entry.amount
  }

  // Tenant delinquency: active leases with negative balance
  const activeLeases = await prisma.lease.findMany({
    where: { ...leasePropertyFilter, status: 'ACTIVE' },
    select: { id: true },
  })
  const leaseIds = activeLeases.map(l => l.id)
  let delinquentCount = 0
  if (leaseIds.length > 0) {
    const balances = await prisma.ledgerEntry.groupBy({
      by: ['leaseId'],
      where: { leaseId: { in: leaseIds } },
      _sum: { amount: true },
    })
    delinquentCount = balances.filter(b => (b._sum.amount ?? 0) < 0).length
  }

  // Open incidents
  const openIncidents = await prisma.incident.count({
    where: { ...propertyFilter, status: { notIn: ['RESOLVED', 'CLOSED'] } },
  })

  // Overdue compliance
  const overdueCompliance = await prisma.complianceItem.count({
    where: { ...propertyFilter, status: 'OVERDUE' },
  })

  const noiTrend = Object.entries(noiByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, noi]) => `${month}: $${noi.toFixed(0)}`)
    .join(', ')

  const stream = anthropic.messages.stream({
    model: AI_MODEL,
    max_tokens: 500,
    system: `You are a property management analyst. Identify 3-5 non-obvious patterns and actionable insights — trends, correlations, early warning signs. Under 200 words. Plain paragraphs, no bullets.`,
    messages: [{
      role: 'user',
      content: `Portfolio scope: ${propertyId ? 'Single property' : 'All properties'}
Total units: ${totalUnits}, Vacant: ${vacantCount} (${totalUnits > 0 ? Math.round((vacantCount / totalUnits) * 100) : 0}% vacancy)
Open work orders (avg days open): ${openWOs.length} WOs, avg ${avgOpenDays} days
NOI by month (last 3 months): ${noiTrend || 'No data'}
Tenants with negative balance (delinquent): ${delinquentCount}
Open incidents: ${openIncidents}
Overdue compliance items: ${overdueCompliance}`,
    }],
  })

  return streamResponse(stream)
}
