import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { anthropic, AI_MODEL } from '@/lib/ai'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  const { title, description } = await req.json()
  if (!title || !description) return NextResponse.json({ error: 'title and description required' }, { status: 400 })

  const message = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 150,
    system: `You are a property maintenance expert. Given a maintenance issue title and description, classify it and return raw JSON only — no markdown, no code fences, no explanation.

JSON schema: { "category": "PLUMBING"|"HVAC"|"ELECTRICAL"|"GENERAL"|"TURNOVER"|"OTHER", "priority": "LOW"|"MEDIUM"|"HIGH"|"EMERGENCY", "urgencyNotes": string }

Urgency rules:
- EMERGENCY: safety hazards (flood, gas leak, fire, no heat in winter, electrical danger)
- HIGH: habitability issues (no hot water, broken lock, major appliance failure)
- MEDIUM: comfort issues (minor leaks, HVAC not optimal, appliance malfunctioning)
- LOW: cosmetic issues (paint, minor scuffs, aesthetic concerns)`,
    messages: [{ role: 'user', content: `Title: ${title}\n\nDescription: ${description}` }],
  })

  try {
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const parsed = JSON.parse(text)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 })
  }
}
