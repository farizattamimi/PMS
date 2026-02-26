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
  if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 })

  // Assets for this property
  const assets = await prisma.asset.findMany({
    where: { propertyId },
    select: { name: true, category: true, condition: true, warrantyExpiry: true },
  })

  // PM schedules (linked via asset → propertyId)
  const pmSchedules = await prisma.pMSchedule.findMany({
    where: { asset: { propertyId } },
    select: { title: true, nextDueAt: true },
  })

  // Last 6-month WO costs grouped by category
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const woCosts = await prisma.workOrderCost.findMany({
    where: {
      workOrder: { propertyId, createdAt: { gte: sixMonthsAgo } },
    },
    include: { workOrder: { select: { category: true } } },
  })

  const costByCategory: Record<string, number> = {}
  for (const c of woCosts) {
    const cat = c.workOrder.category
    costByCategory[cat] = (costByCategory[cat] ?? 0) + c.amount
  }

  const assetsText = assets.length > 0
    ? assets.map(a => `${a.name} (${a.category}, condition: ${a.condition}${a.warrantyExpiry ? ', warranty expires: ' + new Date(a.warrantyExpiry).toISOString().slice(0, 10) : ''})`).join('\n')
    : 'No assets on record'

  const pmText = pmSchedules.length > 0
    ? pmSchedules.map(p => `${p.title}: due ${new Date(p.nextDueAt).toISOString().slice(0, 10)}`).join('\n')
    : 'No PM schedules'

  const costText = Object.keys(costByCategory).length > 0
    ? Object.entries(costByCategory).map(([cat, amt]) => `${cat}: $${amt.toFixed(2)}`).join('\n')
    : 'No recent work order costs'

  const stream = anthropic.messages.stream({
    model: AI_MODEL,
    max_tokens: 400,
    system: `You are a property maintenance analyst. Given asset conditions, upcoming PM schedules, and 6-month cost history, estimate next 3-month maintenance spend. List top 3 cost drivers and a total range. Under 200 words.`,
    messages: [{
      role: 'user',
      content: `Assets:\n${assetsText}\n\nUpcoming PM Schedules:\n${pmText}\n\n6-Month WO Cost History by Category:\n${costText}`,
    }],
  })

  return streamResponse(stream)
}
