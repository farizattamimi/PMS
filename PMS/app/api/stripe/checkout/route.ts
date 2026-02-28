import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.systemRole !== 'TENANT') {
    return NextResponse.json({ error: 'Only tenants can use Stripe checkout' }, { status: 403 })
  }

  const { amount, memo } = await req.json()
  if (typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }

  // Find tenant's active lease
  const tenant = await prisma.tenant.findUnique({
    where: { userId: session.user.id },
    include: {
      leases: {
        where: { status: 'ACTIVE' },
        include: { unit: { include: { property: { select: { id: true, name: true } } } } },
        take: 1,
      },
    },
  })

  const activeLease = tenant?.leases[0]
  if (!activeLease) {
    return NextResponse.json({ error: 'No active lease found' }, { status: 404 })
  }

  const origin = req.headers.get('origin') ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(amount * 100), // cents
          product_data: {
            name: `Rent Payment — ${activeLease.unit.property.name}`,
            description: memo || `Unit ${activeLease.unit.unitNumber}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      leaseId: activeLease.id,
      propertyId: activeLease.unit.propertyId,
      tenantUserId: session.user.id,
      tenantId: tenant!.id,
      memo: memo || 'Tenant payment',
      amountDollars: String(amount),
    },
    success_url: `${origin}/dashboard/my-payments?payment=success`,
    cancel_url: `${origin}/dashboard/my-payments?payment=cancelled`,
  })

  return NextResponse.json({
    checkoutUrl: checkoutSession.url,
    sessionId: checkoutSession.id,
  })
}
