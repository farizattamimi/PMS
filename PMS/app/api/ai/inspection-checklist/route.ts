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

  const { inspectionId } = await req.json()
  if (!inspectionId) return NextResponse.json({ error: 'inspectionId required' }, { status: 400 })

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: {
      items: { select: { area: true } },
    },
  })
  if (!inspection) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })

  // Get existing item areas to avoid duplication
  const existingAreas = Array.from(new Set(inspection.items.map((i: any) => i.area)))

  // Assets in this unit or property
  const assets = await prisma.asset.findMany({
    where: inspection.unitId
      ? { unitId: inspection.unitId }
      : { propertyId: inspection.propertyId! },
    select: { name: true, category: true },
  })

  const assetText = assets.length > 0
    ? assets.map(a => `${a.name} (${a.category})`).join(', ')
    : 'No tracked assets'

  const existingText = existingAreas.length > 0
    ? `Already covered areas: ${existingAreas.join(', ')}`
    : 'No existing items'

  const message = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 600,
    system: `You are a property inspection specialist. Generate a checklist for an inspection. Return a JSON array only — no markdown, no code fences.
Schema: [{"area": string, "notes": string}]
8-15 items. Include standard areas + asset-specific checks. Do not repeat already-covered areas.`,
    messages: [{
      role: 'user',
      content: `Inspection type: ${inspection.type}
Assets present: ${assetText}
${existingText}`,
    }],
  })

  try {
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const items: Array<{ area: string; notes: string }> = JSON.parse(text)

    // Create InspectionItems
    await prisma.inspectionItem.createMany({
      data: items.map(item => ({
        inspectionId,
        area: item.area,
        notes: item.notes,
        condition: 'GOOD',
      })),
    })

    return NextResponse.json({ created: items.length })
  } catch {
    return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 })
  }
}
