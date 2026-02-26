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

  const { leaseId, offeredRent, termMonths } = await req.json()
  if (!leaseId || !offeredRent || !termMonths) {
    return NextResponse.json({ error: 'leaseId, offeredRent, and termMonths required' }, { status: 400 })
  }

  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: {
      tenant: { include: { user: { select: { name: true } } } },
      unit: { select: { unitNumber: true } },
      property: { select: { name: true, address: true, city: true, state: true } },
    },
  })
  if (!lease) return NextResponse.json({ error: 'Lease not found' }, { status: 404 })

  const stream = anthropic.messages.stream({
    model: AI_MODEL,
    max_tokens: 600,
    system: `Write a formal but friendly lease renewal offer letter. Include: greeting, appreciation for tenancy, new terms (rent, term), call to action, professional closing. Under 250 words.`,
    messages: [{
      role: 'user',
      content: `Tenant name: ${lease.tenant.user.name}
Unit: ${lease.unit?.unitNumber ?? 'N/A'} at ${lease.property?.name ?? 'N/A'}
Property address: ${[lease.property?.address, lease.property?.city, lease.property?.state].filter(Boolean).join(', ')}
New monthly rent: $${offeredRent}
Lease term: ${termMonths} months
Current lease end date: ${new Date(lease.endDate).toISOString().slice(0, 10)}`,
    }],
  })

  return streamResponse(stream)
}
