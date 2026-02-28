import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { deliverNotification } from '@/lib/deliver'
import { paymentReceiptEmail, paymentReceiptSms } from '@/lib/email'
import type Stripe from 'stripe'

export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 })

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[stripe webhook] STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    const buf = Buffer.from(await req.arrayBuffer())
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret)
  } catch (err) {
    console.error('[stripe webhook] signature verification failed', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // ── checkout.session.completed ────────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.payment_status !== 'paid') {
      return NextResponse.json({ received: true })
    }

    const meta = session.metadata ?? {}
    const stripeSessionId = session.id
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null

    // Idempotency: skip if we already have this session
    const existing = await prisma.ledgerEntry.findUnique({ where: { stripeSessionId } })
    if (existing) {
      return NextResponse.json({ received: true, deduplicated: true })
    }

    const amountDollars = parseFloat(meta.amountDollars ?? '0')
    if (amountDollars <= 0) {
      console.error('[stripe webhook] invalid amountDollars in metadata', meta)
      return NextResponse.json({ received: true })
    }

    // Create ledger entry (negative = payment/credit)
    const entry = await prisma.ledgerEntry.create({
      data: {
        leaseId: meta.leaseId || null,
        propertyId: meta.propertyId || null,
        type: 'RENT',
        amount: -amountDollars,
        currency: 'USD',
        effectiveDate: new Date(),
        memo: meta.memo || 'Stripe payment',
        stripeSessionId,
        stripePaymentIntentId: paymentIntentId,
      },
    })

    // Audit
    await writeAudit({
      actorUserId: meta.tenantUserId || undefined,
      action: 'CREATE',
      entityType: 'LedgerEntry',
      entityId: entry.id,
      diff: { source: 'stripe', stripeSessionId, amount: -amountDollars },
    })

    // Notify tenant
    if (meta.tenantUserId) {
      const user = await prisma.user.findUnique({ where: { id: meta.tenantUserId }, select: { name: true } })
      const tenantName = user?.name ?? 'Tenant'
      const dateStr = new Date().toLocaleDateString()
      await deliverNotification({
        userId: meta.tenantUserId,
        title: 'Payment received',
        body: `Your payment of $${amountDollars.toFixed(2)} has been processed.`,
        type: 'PAYMENT_RECEIVED',
        entityType: 'LedgerEntry',
        entityId: entry.id,
        emailSubject: 'Payment Confirmation',
        emailHtml: paymentReceiptEmail(tenantName, amountDollars, dateStr),
        smsBody: paymentReceiptSms(tenantName, amountDollars, dateStr),
      })
    }

    // Notify property manager
    if (meta.propertyId) {
      const property = await prisma.property.findUnique({ where: { id: meta.propertyId }, select: { managerId: true, name: true } })
      if (property?.managerId) {
        await deliverNotification({
          userId: property.managerId,
          title: 'Tenant payment received',
          body: `$${amountDollars.toFixed(2)} payment at ${property.name}.`,
          type: 'PAYMENT_RECEIVED',
          entityType: 'LedgerEntry',
          entityId: entry.id,
        })
      }
    }

    return NextResponse.json({ received: true, entryId: entry.id })
  }

  // ── charge.succeeded ──────────────────────────────────────────────────────
  if (event.type === 'charge.succeeded') {
    const charge = event.data.object as Stripe.Charge
    const receiptUrl = charge.receipt_url
    const paymentIntentId = typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : null

    if (paymentIntentId && receiptUrl) {
      await prisma.ledgerEntry.updateMany({
        where: { stripePaymentIntentId: paymentIntentId },
        data: { stripeReceiptUrl: receiptUrl },
      })
    }

    return NextResponse.json({ received: true })
  }

  // Unhandled event type — acknowledge
  return NextResponse.json({ received: true })
}
