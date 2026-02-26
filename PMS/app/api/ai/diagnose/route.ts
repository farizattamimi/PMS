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

  const { workOrderId } = await req.json()
  if (!workOrderId) return NextResponse.json({ error: 'workOrderId required' }, { status: 400 })

  const wo = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    include: {
      unit: { select: { id: true, unitNumber: true } },
      property: { select: { name: true } },
    },
  })
  if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

  // Fetch assets for the unit
  const assets = wo.unitId
    ? await prisma.asset.findMany({
        where: { unitId: wo.unitId },
        select: { name: true, category: true, condition: true },
      })
    : []

  // Last 3 completed WOs on same unit
  const previousWOs = wo.unitId
    ? await prisma.workOrder.findMany({
        where: { unitId: wo.unitId, status: 'COMPLETED', id: { not: workOrderId } },
        orderBy: { completedAt: 'desc' },
        take: 3,
        select: { title: true, category: true, description: true },
      })
    : []

  const context = `Work Order: ${wo.title}
Category: ${wo.category}
Description: ${wo.description}
Unit: ${wo.unit?.unitNumber ?? 'N/A'} at ${wo.property?.name ?? 'N/A'}

Assets in unit: ${assets.length > 0 ? assets.map(a => `${a.name} (${a.category}, ${a.condition})`).join(', ') : 'None recorded'}

Recent completed work orders on this unit:
${previousWOs.length > 0 ? previousWOs.map(w => `- ${w.title} (${w.category}): ${w.description?.slice(0, 80) ?? ''}`).join('\n') : 'None'}`

  const stream = anthropic.messages.stream({
    model: AI_MODEL,
    max_tokens: 800,
    system: `Property maintenance expert. Given the work order and context, provide:
**Likely Causes** (2-3 bullets)
**Recommended Steps** (numbered)
**Estimated Time**
**Estimated Cost Range**
Be practical. Under 300 words.`,
    messages: [{ role: 'user', content: context }],
  })

  return streamResponse(stream)
}
