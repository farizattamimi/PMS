import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { anthropic, AI_MODEL } from '@/lib/ai'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.systemRole !== 'MANAGER' && session.user.systemRole !== 'ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  const { workOrderId } = await req.json()
  if (!workOrderId) return NextResponse.json({ error: 'workOrderId required' }, { status: 400 })

  const wo = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    include: {
      costs: { select: { costType: true, amount: true, memo: true } },
    },
  })
  if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

  if (wo.costs.length === 0) {
    return NextResponse.json({ anomalies: [] })
  }

  // Historical avg cost per costType for same property + WO category in last 12 months
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

  const historicalCosts = await prisma.workOrderCost.findMany({
    where: {
      workOrder: {
        propertyId: wo.propertyId,
        category: wo.category,
        createdAt: { gte: twelveMonthsAgo },
        id: { not: workOrderId },
      },
    },
    select: { costType: true, amount: true },
  })

  // Compute avg by costType
  const avgByCostType: Record<string, number> = {}
  const countByCostType: Record<string, number> = {}
  for (const c of historicalCosts) {
    avgByCostType[c.costType] = (avgByCostType[c.costType] ?? 0) + c.amount
    countByCostType[c.costType] = (countByCostType[c.costType] ?? 0) + 1
  }
  for (const t of Object.keys(avgByCostType)) {
    avgByCostType[t] = avgByCostType[t] / countByCostType[t]
  }

  const currentCostsText = wo.costs.map(c =>
    `${c.costType}: $${c.amount.toFixed(2)}${c.memo ? ` (${c.memo})` : ''}`
  ).join('\n')

  const historicalText = Object.keys(avgByCostType).length > 0
    ? Object.entries(avgByCostType).map(([t, avg]) => `${t}: avg $${avg.toFixed(2)} over last 12 months`).join('\n')
    : 'No historical data for this property/category'

  const message = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 200,
    system: `You are a property cost analyst. Analyze work order costs vs historical averages. Return raw JSON only — no markdown, no code fences.
Schema: { "anomalies": [{"costType": string, "severity": "low"|"high", "note": string}] }
Flag costs more than 50% above historical average as "high" severity. Empty array if no anomalies.`,
    messages: [{
      role: 'user',
      content: `Work order category: ${wo.category}

Current WO costs:
${currentCostsText}

Historical averages (same property + category):
${historicalText}`,
    }],
  })

  try {
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const parsed = JSON.parse(text)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 })
  }
}
