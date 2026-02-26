import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeManagerPropertyIds, validateCronSecret } from '@/lib/security'

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
