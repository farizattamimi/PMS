import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { POST as screeningWebhookPOST } from '@/app/api/screening/webhook/route'

test('screening webhook rejects unsigned requests by default', async () => {
  const oldBearer = process.env.SCREENING_WEBHOOK_SECRET
  const oldHmac = process.env.SCREENING_WEBHOOK_HMAC_SECRET
  try {
    process.env.SCREENING_WEBHOOK_SECRET = 'bearer-secret'
    delete process.env.SCREENING_WEBHOOK_HMAC_SECRET
    const res = await screeningWebhookPOST(
      new Request('http://localhost/api/screening/webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providerRef: 'abc' }),
      })
    )
    assert.equal(res.status, 401)
  } finally {
    process.env.SCREENING_WEBHOOK_SECRET = oldBearer
    process.env.SCREENING_WEBHOOK_HMAC_SECRET = oldHmac
  }
})

test('screening webhook validates HMAC signature when configured', async () => {
  const oldBearer = process.env.SCREENING_WEBHOOK_SECRET
  const oldHmac = process.env.SCREENING_WEBHOOK_HMAC_SECRET
  const originalFindFirst = (prisma.screeningReport as any).findFirst
  const originalUpdate = (prisma.screeningReport as any).update
  try {
    process.env.SCREENING_WEBHOOK_SECRET = 'bearer-secret'
    process.env.SCREENING_WEBHOOK_HMAC_SECRET = 'hmac-secret'

    let updatedId: string | null = null
    ;(prisma.screeningReport as any).findFirst = async () => ({ id: 'r-1' })
    ;(prisma.screeningReport as any).update = async (args: any) => {
      updatedId = args.where.id
      return { id: args.where.id }
    }

    const payload = JSON.stringify({ providerRef: 'abc', overallStatus: 'CLEAR' })
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = crypto
      .createHmac('sha256', 'hmac-secret')
      .update(`${timestamp}.${payload}`)
      .digest('hex')

    const res = await screeningWebhookPOST(
      new Request('http://localhost/api/screening/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-screening-event-id': `evt-${Date.now()}-ok`,
          'x-screening-timestamp': timestamp,
          'x-screening-signature': `sha256=${signature}`,
        },
        body: payload,
      })
    )
    assert.equal(res.status, 200)
    assert.equal(updatedId, 'r-1')
  } finally {
    process.env.SCREENING_WEBHOOK_SECRET = oldBearer
    process.env.SCREENING_WEBHOOK_HMAC_SECRET = oldHmac
    ;(prisma.screeningReport as any).findFirst = originalFindFirst
    ;(prisma.screeningReport as any).update = originalUpdate
  }
})

test('screening webhook requires timestamp when HMAC mode is enabled', async () => {
  const oldBearer = process.env.SCREENING_WEBHOOK_SECRET
  const oldHmac = process.env.SCREENING_WEBHOOK_HMAC_SECRET
  try {
    process.env.SCREENING_WEBHOOK_SECRET = 'bearer-secret'
    process.env.SCREENING_WEBHOOK_HMAC_SECRET = 'hmac-secret'
    const payload = JSON.stringify({ providerRef: 'abc' })
    const signature = crypto.createHmac('sha256', 'hmac-secret').update(payload).digest('hex')
    const res = await screeningWebhookPOST(
      new Request('http://localhost/api/screening/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-screening-signature': `sha256=${signature}`,
        },
        body: payload,
      })
    )
    assert.equal(res.status, 401)
  } finally {
    process.env.SCREENING_WEBHOOK_SECRET = oldBearer
    process.env.SCREENING_WEBHOOK_HMAC_SECRET = oldHmac
  }
})

test('screening webhook rejects replayed event IDs', async () => {
  const oldBearer = process.env.SCREENING_WEBHOOK_SECRET
  const oldHmac = process.env.SCREENING_WEBHOOK_HMAC_SECRET
  const originalFindFirst = (prisma.screeningReport as any).findFirst
  const originalUpdate = (prisma.screeningReport as any).update
  try {
    process.env.SCREENING_WEBHOOK_SECRET = 'bearer-secret'
    process.env.SCREENING_WEBHOOK_HMAC_SECRET = 'hmac-secret'

    ;(prisma.screeningReport as any).findFirst = async () => ({ id: 'r-1' })
    ;(prisma.screeningReport as any).update = async (args: any) => ({ id: args.where.id })

    const payload = JSON.stringify({ providerRef: 'abc', overallStatus: 'CLEAR' })
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = crypto
      .createHmac('sha256', 'hmac-secret')
      .update(`${timestamp}.${payload}`)
      .digest('hex')
    const eventId = `evt-${Date.now()}-replay`

    const first = await screeningWebhookPOST(
      new Request('http://localhost/api/screening/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-screening-event-id': eventId,
          'x-screening-timestamp': timestamp,
          'x-screening-signature': `sha256=${signature}`,
        },
        body: payload,
      })
    )
    assert.equal(first.status, 200)

    const second = await screeningWebhookPOST(
      new Request('http://localhost/api/screening/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-screening-event-id': eventId,
          'x-screening-timestamp': timestamp,
          'x-screening-signature': `sha256=${signature}`,
        },
        body: payload,
      })
    )
    assert.equal(second.status, 409)
  } finally {
    process.env.SCREENING_WEBHOOK_SECRET = oldBearer
    process.env.SCREENING_WEBHOOK_HMAC_SECRET = oldHmac
    ;(prisma.screeningReport as any).findFirst = originalFindFirst
    ;(prisma.screeningReport as any).update = originalUpdate
  }
})
