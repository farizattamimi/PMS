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

  const { unitId } = await req.json()
  if (!unitId) return NextResponse.json({ error: 'unitId required' }, { status: 400 })

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    include: {
      property: {
        include: {
          units: { select: { status: true } },
        },
      },
    },
  })
  if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })

  const totalUnits = unit.property.units.length
  const occupiedUnits = unit.property.units.filter((u: any) => u.status === 'OCCUPIED').length
  const occupancyPct = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0

  const message = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 150,
    system: `You are a rental pricing advisor. Based on unit details and market occupancy, suggest whether to raise, hold, or reduce rent. Return raw JSON only — no markdown, no code fences.
Schema: { "suggestion": "RAISE"|"HOLD"|"REDUCE", "delta": number|null, "rationale": string }
delta is suggested dollar change (positive = raise, negative = reduce, null = hold). Rationale is one sentence.`,
    messages: [{
      role: 'user',
      content: `Unit: ${unit.bedrooms}BR/${unit.bathrooms}BA, ${unit.sqFt ?? 'unknown'} sqft
Current rent: $${unit.monthlyRent}/mo
Unit status: ${unit.status}
Property occupancy: ${occupancyPct}% (${occupiedUnits}/${totalUnits} units occupied)
Last updated: ${unit.updatedAt.toISOString().slice(0, 10)}`,
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
