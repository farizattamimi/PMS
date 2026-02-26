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

  const { leaseId } = await req.json()
  if (!leaseId) return NextResponse.json({ error: 'leaseId required' }, { status: 400 })

  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: {
      tenant: { include: { user: { select: { id: true, name: true } } } },
      unit: { select: { id: true, unitNumber: true } },
    },
  })
  if (!lease) return NextResponse.json({ error: 'Lease not found' }, { status: 404 })

  // Ledger balance for this lease
  const ledgerAgg = await prisma.ledgerEntry.aggregate({
    where: { leaseId },
    _sum: { amount: true },
  })
  const balance = ledgerAgg._sum.amount ?? 0

  // Open work orders for the tenant's user
  const openWOCount = await prisma.workOrder.count({
    where: {
      submittedById: lease.tenant.userId,
      status: { notIn: ['COMPLETED', 'CANCELED'] },
    },
  })

  // Incidents reported by this tenant in last 12 months
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
  const incidentCount = await prisma.incident.count({
    where: {
      reportedBy: lease.tenant.userId,
      createdAt: { gte: twelveMonthsAgo },
    },
  })

  const daysToExpiry = Math.round((new Date(lease.endDate).getTime() - Date.now()) / 86400000)

  const message = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 150,
    system: `You are a property management AI. Classify tenant churn/renewal risk as LOW, MEDIUM, or HIGH.
Return raw JSON only — no markdown, no code fences.
Schema: { "risk": "LOW"|"MEDIUM"|"HIGH", "rationale": string }
Rationale should be one concise sentence.`,
    messages: [{
      role: 'user',
      content: `Tenant: ${lease.tenant.user.name}
Days to lease expiry: ${daysToExpiry}
Ledger balance (negative = owes money): ${balance.toFixed(2)}
Open unresolved work orders submitted by tenant: ${openWOCount}
Incidents involving tenant (last 12 months): ${incidentCount}
Monthly rent: ${lease.monthlyRent}`,
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
