import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeManagerPropertyIds, validateCronSecret } from '@/lib/security'
import { POST as agentEventsPOST } from '@/app/api/agent/events/route'

const env = process.env as Record<string, string | undefined>

test('validateCronSecret allows non-production without secret', () => {
  assert.deepEqual(
    validateCronSecret({ cronSecret: undefined, nodeEnv: 'development', providedSecret: null }),
    { ok: true }
  )
})

test('validateCronSecret rejects production without secret', () => {
  assert.deepEqual(
    validateCronSecret({ cronSecret: undefined, nodeEnv: 'production', providedSecret: null }),
    {
      ok: false,
      status: 500,
      error: 'Server misconfigured: CRON_SECRET is required in production',
    }
  )
})

test('validateCronSecret rejects invalid secret and accepts valid secret', () => {
  assert.deepEqual(
    validateCronSecret({ cronSecret: 'abc123', nodeEnv: 'production', providedSecret: 'wrong' }),
    { ok: false, status: 401, error: 'Unauthorized' }
  )

  assert.deepEqual(
    validateCronSecret({ cronSecret: 'abc123', nodeEnv: 'production', providedSecret: 'abc123' }),
    { ok: true }
  )
})

test('normalizeManagerPropertyIds filters non-strings and deduplicates', () => {
  assert.deepEqual(
    normalizeManagerPropertyIds(['p1', 'p2', '', 'p1', 42, null, undefined, 'p3']),
    ['p1', 'p2', 'p3']
  )
  assert.deepEqual(normalizeManagerPropertyIds('nope'), [])
})

test('POST /api/agent/events returns validateCronSecret status/error in production misconfig', async () => {
  const oldNodeEnv = process.env.NODE_ENV
  const oldCronSecret = process.env.CRON_SECRET
  try {
    env.NODE_ENV = 'production'
    delete env.CRON_SECRET
    const req = new Request('http://localhost/api/agent/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventType: 'PM_DUE', propertyId: 'p1' }),
    })
    const res = await agentEventsPOST(req)
    assert.equal(res.status, 500)
    const body = await res.json()
    assert.equal(body.error, 'Server misconfigured: CRON_SECRET is required in production')
  } finally {
    env.NODE_ENV = oldNodeEnv
    env.CRON_SECRET = oldCronSecret
  }
})

test('POST /api/agent/events requires propertyId before creating MAINTENANCE run', async () => {
  const oldNodeEnv = process.env.NODE_ENV
  const oldCronSecret = process.env.CRON_SECRET
  try {
    env.NODE_ENV = 'test'
    env.CRON_SECRET = 'test-secret'
    const req = new Request('http://localhost/api/agent/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-secret',
      },
      body: JSON.stringify({ eventType: 'PM_DUE' }),
    })
    const res = await agentEventsPOST(req)
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'propertyId is required for MAINTENANCE events')
  } finally {
    env.NODE_ENV = oldNodeEnv
    env.CRON_SECRET = oldCronSecret
  }
})
