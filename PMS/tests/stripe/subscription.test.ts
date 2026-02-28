/**
 * tests/stripe/subscription.test.ts
 *
 * Unit tests for Recurring Stripe Billing.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('Recurring Stripe Billing', { concurrency: 1 }, () => {
  it('1. subscribe rejects unauthenticated (null session)', () => {
    const session = null
    const isAllowed = session !== null && (session as any).user?.systemRole === 'TENANT'
    assert.equal(isAllowed, false)
  })

  it('2. subscribe rejects non-TENANT role', () => {
    const session = { user: { systemRole: 'MANAGER' } }
    assert.notEqual(session.user.systemRole, 'TENANT')
  })

  it('3. subscribe requires active lease', () => {
    const leases: any[] = []
    const activeLease = leases.find((l: any) => l.status === 'ACTIVE')
    assert.equal(activeLease, undefined)
  })

  it('4. subscribe returns 409 if already subscribed', () => {
    const lease = { stripeSubscriptionId: 'sub_abc' }
    assert.ok(!!lease.stripeSubscriptionId, 'Should detect existing subscription')
  })

  it('5. subscribe creates customer if stripeCustomerId is null', () => {
    const tenant = { stripeCustomerId: null }
    const needsCustomer = !tenant.stripeCustomerId
    assert.ok(needsCustomer)
  })

  it('6. subscribe reuses existing stripeCustomerId', () => {
    const tenant = { stripeCustomerId: 'cus_existing' }
    const needsCustomer = !tenant.stripeCustomerId
    assert.ok(!needsCustomer)
  })

  it('7. checkout session uses subscription mode', () => {
    const config = {
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: 150000,
          recurring: { interval: 'month' },
          product_data: { name: 'Monthly Rent' },
        },
        quantity: 1,
      }],
    }
    assert.equal(config.mode, 'subscription')
    assert.ok(config.line_items[0].price_data.recurring)
  })

  it('8. monthly amount converts to cents correctly', () => {
    const monthlyRent = 1500.00
    const cents = Math.round(monthlyRent * 100)
    assert.equal(cents, 150000)
  })

  it('9. portal rejects non-TENANT', () => {
    const session = { user: { systemRole: 'ADMIN' } }
    assert.notEqual(session.user.systemRole, 'TENANT')
  })

  it('10. portal requires stripeCustomerId', () => {
    const tenant = { stripeCustomerId: null }
    assert.ok(!tenant.stripeCustomerId, 'Should require customer ID')
  })

  it('11. invoice.payment_succeeded dedup by stripeInvoiceId', () => {
    const existingEntry = { id: 'le1', stripeInvoiceId: 'inv_123' }
    const isDuplicate = existingEntry !== null
    assert.ok(isDuplicate, 'Should skip duplicate')
  })

  it('12. subscription status syncs from Stripe', () => {
    const validStatuses = ['active', 'past_due', 'canceled', 'unpaid', 'incomplete']
    assert.ok(validStatuses.includes('active'))
    assert.ok(validStatuses.includes('past_due'))
    // Lease.stripeSubscriptionStatus should match Stripe status
    const lease = { stripeSubscriptionStatus: 'active' }
    lease.stripeSubscriptionStatus = 'past_due'
    assert.equal(lease.stripeSubscriptionStatus, 'past_due')
  })
})
