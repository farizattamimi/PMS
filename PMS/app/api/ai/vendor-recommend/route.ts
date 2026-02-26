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
    select: { title: true, description: true, category: true, propertyId: true },
  })
  if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

  // Fetch vendors assigned to this property
  const propertyVendors = await prisma.propertyVendor.findMany({
    where: { propertyId: wo.propertyId },
    include: {
      vendor: {
        select: {
          id: true,
          name: true,
          serviceCategories: true,
          performanceScore: true,
          licenseExpiry: true,
          insuranceExpiry: true,
        },
      },
    },
  })

  if (propertyVendors.length === 0) {
    return NextResponse.json({ vendorId: null, vendorName: null, reason: 'No vendors assigned to this property' })
  }

  const vendorList = propertyVendors.map(pv => {
    const v = pv.vendor
    const licenseOk = !v.licenseExpiry || new Date(v.licenseExpiry) > new Date()
    const insuranceOk = !v.insuranceExpiry || new Date(v.insuranceExpiry) > new Date()
    return `ID: ${v.id} | Name: ${v.name} | Categories: ${v.serviceCategories.join(', ')} | Score: ${v.performanceScore ?? 'N/A'} | License valid: ${licenseOk} | Insurance valid: ${insuranceOk}`
  }).join('\n')

  const message = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 150,
    system: `Select the best vendor for this work order. Return JSON only — no markdown, no code fences: {"vendorId": string, "vendorName": string, "reason": string (one sentence)}. Rank by: 1) specialty match, 2) performance score, 3) valid credentials.`,
    messages: [{
      role: 'user',
      content: `Work Order: ${wo.title}\nCategory: ${wo.category}\nDescription: ${wo.description}\n\nAvailable vendors:\n${vendorList}`,
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
