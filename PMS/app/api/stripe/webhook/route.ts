import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { deliverNotification } from '@/lib/deliver'
import { paymentReceiptEmail, paymentReceiptSms, autoPayFailedEmail, autoPayFailedSms } from '@/lib/email'
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
    if (session.payment_status !== 'paid' && session.mode !== 'subscription') {
      return NextResponse.json({ received: true })
    }

    const meta = session.metadata ?? {}

    // ── Subscription mode: save subscription ID to lease ──────────────────
    if (session.mode === 'subscription') {
      const subscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription as Stripe.Subscription | null)?.id ?? null

      if (subscriptionId && meta.leaseId) {
        await prisma.lease.update({
          where: { id: meta.leaseId },
          data: {
            stripeSubscriptionId: subscriptionId,
            stripeSubscriptionStatus: 'active',
          },
        })

        await writeAudit({
          actorUserId: meta.tenantUserId || undefined,
          action: 'UPDATE',
          entityType: 'Lease',
          entityId: meta.leaseId,
          diff: { stripeSubscriptionId: subscriptionId, event: 'autopay_enabled' },
        })

        if (meta.tenantUserId) {
          await deliverNotification({
            userId: meta.tenantUserId,
            title: 'Auto-Pay enabled',
            body: 'Your monthly rent will be charged automatically.',
            type: 'PAYMENT_DUE',
            entityType: 'Lease',
            entityId: meta.leaseId,
          })
        }
      }
      return NextResponse.json({ received: true })
    }

    // ── One-time payment mode ─────────────────────────────────────────────
    if (session.payment_status !== 'paid') {
      return NextResponse.json({ received: true })
    }

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

    await writeAudit({
      actorUserId: meta.tenantUserId || undefined,
      action: 'CREATE',
      entityType: 'LedgerEntry',
      entityId: entry.id,
      diff: { source: 'stripe', stripeSessionId, amount: -amountDollars },
    })

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

  // ── invoice.payment_succeeded (subscription auto-charge) ───────────────
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as any
    if (!invoice.subscription) return NextResponse.json({ received: true })

    const stripeInvoiceId = invoice.id as string

    // Idempotency: skip if already processed
    const existing = await prisma.ledgerEntry.findUnique({ where: { stripeInvoiceId } })
    if (existing) return NextResponse.json({ received: true, deduplicated: true })

    // Find the lease by subscription ID
    const subscriptionId = typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id
    const lease = await prisma.lease.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
      include: {
        tenant: { include: { user: { select: { id: true, name: true } } } },
        unit: { include: { property: { select: { id: true, name: true, managerId: true } } } },
      },
    })
    if (!lease) {
      console.warn('[stripe webhook] invoice.payment_succeeded — no lease for subscription', subscriptionId)
      return NextResponse.json({ received: true })
    }

    const amountDollars = (invoice.amount_paid ?? 0) / 100

    const entry = await prisma.ledgerEntry.create({
      data: {
        leaseId: lease.id,
        propertyId: lease.unit.propertyId,
        type: 'RENT',
        amount: -amountDollars,
        currency: 'USD',
        effectiveDate: new Date(),
        memo: 'Auto-Pay — Stripe subscription',
        stripeInvoiceId,
      },
    })

    await writeAudit({
      actorUserId: lease.tenant.user.id,
      action: 'CREATE',
      entityType: 'LedgerEntry',
      entityId: entry.id,
      diff: { source: 'stripe_subscription', stripeInvoiceId, amount: -amountDollars },
    })

    const tenantName = lease.tenant.user.name ?? 'Tenant'
    const dateStr = new Date().toLocaleDateString()
    await deliverNotification({
      userId: lease.tenant.user.id,
      title: 'Auto-Pay payment processed',
      body: `Your monthly payment of $${amountDollars.toFixed(2)} has been charged.`,
      type: 'PAYMENT_RECEIVED',
      entityType: 'LedgerEntry',
      entityId: entry.id,
      emailSubject: 'Auto-Pay Payment Confirmation',
      emailHtml: paymentReceiptEmail(tenantName, amountDollars, dateStr),
      smsBody: paymentReceiptSms(tenantName, amountDollars, dateStr),
    })

    // Notify manager
    const prop = lease.unit.property
    if (prop.managerId) {
      await deliverNotification({
        userId: prop.managerId,
        title: 'Auto-Pay payment received',
        body: `$${amountDollars.toFixed(2)} auto-pay at ${prop.name}.`,
        type: 'PAYMENT_RECEIVED',
        entityType: 'LedgerEntry',
        entityId: entry.id,
      })
    }

    return NextResponse.json({ received: true, entryId: entry.id })
  }

  // ── invoice.payment_failed ─────────────────────────────────────────────
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as any
    if (!invoice.subscription) return NextResponse.json({ received: true })

    const subscriptionId = typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id
    const lease = await prisma.lease.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
      include: {
        tenant: { include: { user: { select: { id: true, name: true } } } },
        unit: { include: { property: { select: { id: true, name: true, managerId: true } } } },
      },
    })
    if (!lease) return NextResponse.json({ received: true })

    const amountDollars = (invoice.amount_due ?? 0) / 100
    const tenantName = lease.tenant.user.name ?? 'Tenant'
    const propName = lease.unit.property.name

    // Notify tenant
    await deliverNotification({
      userId: lease.tenant.user.id,
      title: 'Auto-Pay payment failed',
      body: `Your monthly payment of $${amountDollars.toFixed(2)} could not be processed. Please update your payment method.`,
      type: 'PAYMENT_DUE',
      entityType: 'Lease',
      entityId: lease.id,
      emailSubject: 'Auto-Pay Payment Failed',
      emailHtml: autoPayFailedEmail(tenantName, amountDollars, propName),
      smsBody: autoPayFailedSms(tenantName, amountDollars, propName),
    })

    // Notify manager
    const prop = lease.unit.property
    if (prop.managerId) {
      await deliverNotification({
        userId: prop.managerId,
        title: 'Tenant auto-pay failed',
        body: `$${amountDollars.toFixed(2)} auto-pay failed for ${tenantName} at ${propName}.`,
        type: 'PAYMENT_DUE',
        entityType: 'Lease',
        entityId: lease.id,
      })
    }

    return NextResponse.json({ received: true })
  }

  // ── customer.subscription.updated ──────────────────────────────────────
  if (event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as Stripe.Subscription
    const lease = await prisma.lease.findUnique({
      where: { stripeSubscriptionId: subscription.id },
    })
    if (lease) {
      await prisma.lease.update({
        where: { id: lease.id },
        data: { stripeSubscriptionStatus: subscription.status },
      })
    }
    return NextResponse.json({ received: true })
  }

  // ── customer.subscription.deleted ─────────────────────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription
    const lease = await prisma.lease.findUnique({
      where: { stripeSubscriptionId: subscription.id },
    })
    if (lease) {
      await prisma.lease.update({
        where: { id: lease.id },
        data: {
          stripeSubscriptionStatus: 'canceled',
          stripeSubscriptionId: null,
        },
      })
      await writeAudit({
        action: 'UPDATE',
        entityType: 'Lease',
        entityId: lease.id,
        diff: { event: 'subscription_deleted', stripeSubscriptionId: subscription.id },
      })
    }
    return NextResponse.json({ received: true })
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
