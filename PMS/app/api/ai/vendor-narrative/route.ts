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

  const { vendorId } = await req.json()
  if (!vendorId) return NextResponse.json({ error: 'vendorId required' }, { status: 400 })

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: {
      reviews: {
        select: { score: true, quality: true, responseTime: true, notes: true },
        orderBy: { createdAt: 'desc' },
      },
      workOrders: {
        where: { status: 'COMPLETED' },
        select: { title: true, category: true },
        orderBy: { completedAt: 'desc' },
        take: 5,
      },
    },
  })
  if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })

  const reviewsText = vendor.reviews.length > 0
    ? vendor.reviews.map(r =>
        `Score: ${r.score}/5, Quality: ${r.quality}/5${r.responseTime != null ? `, Response: ${r.responseTime}h` : ''}${r.notes ? `, Notes: "${r.notes}"` : ''}`
      ).join('\n')
    : 'No reviews on record'

  const woText = vendor.workOrders.length > 0
    ? vendor.workOrders.map(w => `${w.title} (${w.category})`).join('\n')
    : 'No completed work orders'

  const stream = anthropic.messages.stream({
    model: AI_MODEL,
    max_tokens: 400,
    system: `Write a 1-2 paragraph vendor performance summary for property managers. Cover reliability, quality, response times, strengths/concerns. Under 150 words. No headers.`,
    messages: [{
      role: 'user',
      content: `Vendor: ${vendor.name}
Service categories: ${vendor.serviceCategories.join(', ') || 'None specified'}
Overall performance score: ${vendor.performanceScore != null ? vendor.performanceScore.toFixed(1) + '/5' : 'N/A'} (${vendor.reviewCount} review${vendor.reviewCount !== 1 ? 's' : ''})

Reviews:
${reviewsText}

Last 5 completed work orders:
${woText}`,
    }],
  })

  return streamResponse(stream)
}
