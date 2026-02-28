import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.systemRole !== 'TENANT') {
    return NextResponse.json({ error: 'Only tenants can access billing portal' }, { status: 403 })
  }

  const tenant = await prisma.tenant.findUnique({
    where: { userId: session.user.id },
    select: { stripeCustomerId: true },
  })

  if (!tenant?.stripeCustomerId) {
    return NextResponse.json({ error: 'No billing account found. Set up auto-pay first.' }, { status: 404 })
  }

  const origin = req.headers.get('origin') ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: `${origin}/dashboard/my-payments`,
  })

  return NextResponse.json({ portalUrl: portalSession.url })
}
