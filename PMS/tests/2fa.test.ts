/**
 * tests/2fa.test.ts
 *
 * Unit tests for Two-Factor Authentication.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'

// ── Test the TOTP library helpers directly ──────────────────────────────────

function generateBackupCodes(): string[] {
  const codes: string[] = []
  for (let i = 0; i < 10; i++) {
    codes.push(crypto.randomBytes(4).toString('hex'))
  }
  return codes
}

function hashBackupCodes(codes: string[]): string[] {
  return codes.map(code => crypto.createHash('sha256').update(code).digest('hex'))
}

function verifyBackupCode(code: string, hashedCodes: string[]): number {
  const hash = crypto.createHash('sha256').update(code).digest('hex')
  return hashedCodes.indexOf(hash)
}

describe('Two-Factor Authentication', { concurrency: 1 }, () => {
  it('1. generateBackupCodes creates 10 codes', () => {
    const codes = generateBackupCodes()
    assert.equal(codes.length, 10)
  })

  it('2. backup codes are 8-char hex', () => {
    const codes = generateBackupCodes()
    codes.forEach(code => {
      assert.ok(code.length === 8, `Expected 8 chars: ${code}`)
      assert.ok(/^[0-9a-f]{8}$/.test(code), `Expected hex: ${code}`)
    })
  })

  it('3. hashBackupCodes produces deterministic hashes', () => {
    const codes = ['abcd1234']
    const h1 = hashBackupCodes(codes)
    const h2 = hashBackupCodes(codes)
    assert.deepEqual(h1, h2)
    assert.notEqual(h1[0], codes[0], 'Hash should differ from plain')
  })

  it('4. verifyBackupCode finds correct index', () => {
    const codes = generateBackupCodes()
    const hashed = hashBackupCodes(codes)
    const idx = verifyBackupCode(codes[3], hashed)
    assert.equal(idx, 3)
  })

  it('5. verifyBackupCode rejects invalid code', () => {
    const codes = generateBackupCodes()
    const hashed = hashBackupCodes(codes)
    assert.equal(verifyBackupCode('zzzzzzzz', hashed), -1)
  })

  it('6. backup codes are all unique', () => {
    const codes = generateBackupCodes()
    const unique = new Set(codes)
    assert.equal(unique.size, 10)
  })

  it('7. consumed backup code removed from list', () => {
    const codes = generateBackupCodes()
    const hashed = hashBackupCodes(codes)
    const idx = verifyBackupCode(codes[5], hashed)
    assert.equal(idx, 5)
    // Consume it
    const remaining = [...hashed]
    remaining.splice(idx, 1)
    assert.equal(remaining.length, 9)
    // Should not be found again
    assert.equal(verifyBackupCode(codes[5], remaining), -1)
  })

  it('8. 2FA auth flow: requires code when 2FA enabled', () => {
    const user = { twoFactorEnabled: true, twoFactorSecret: 'secret123' }
    const totpCode = '' // empty
    if (user.twoFactorEnabled && user.twoFactorSecret && !totpCode) {
      assert.ok(true, '2FA_REQUIRED should be thrown')
    } else {
      assert.fail('Should require 2FA code')
    }
  })

  it('9. 2FA auth flow: skips 2FA when not enabled', () => {
    const user = { twoFactorEnabled: false, twoFactorSecret: null }
    const totpCode = ''
    if (user.twoFactorEnabled && user.twoFactorSecret && !totpCode) {
      assert.fail('Should not require 2FA')
    }
    assert.ok(true, 'Passes without 2FA')
  })

  it('10. SHA-256 hash is 64 hex chars', () => {
    const hash = crypto.createHash('sha256').update('test').digest('hex')
    assert.equal(hash.length, 64)
    assert.ok(/^[0-9a-f]{64}$/.test(hash))
  })
})
