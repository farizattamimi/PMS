import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.systemRole !== 'TENANT') {
    return NextResponse.json({ error: 'Only tenants can subscribe' }, { status: 403 })
  }

  // Find tenant's active lease
  const tenant = await prisma.tenant.findUnique({
    where: { userId: session.user.id },
    include: {
      user: { select: { email: true, name: true } },
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

  // Already subscribed?
  if (activeLease.stripeSubscriptionId) {
    return NextResponse.json({ error: 'Already subscribed. Use the billing portal to manage.' }, { status: 409 })
  }

  // Get or create Stripe customer
  let customerId = tenant.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: tenant.user.email,
      name: tenant.user.name,
      metadata: { tenantId: tenant.id, userId: session.user.id },
    })
    customerId = customer.id
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { stripeCustomerId: customerId },
    })
  }

  const origin = req.headers.get('origin') ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

  // Create Checkout Session in subscription mode
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(activeLease.monthlyRent * 100),
          recurring: { interval: 'month' },
          product_data: {
            name: `Monthly Rent — ${activeLease.unit.property.name}`,
            description: `Unit ${activeLease.unit.unitNumber}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      leaseId: activeLease.id,
      propertyId: activeLease.unit.propertyId,
      tenantUserId: session.user.id,
      tenantId: tenant.id,
    },
    success_url: `${origin}/dashboard/my-payments?autopay=success`,
    cancel_url: `${origin}/dashboard/my-payments?autopay=cancelled`,
  })

  return NextResponse.json({
    checkoutUrl: checkoutSession.url,
    sessionId: checkoutSession.id,
  })
}
