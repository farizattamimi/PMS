import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MockScreeningProvider } from '../../lib/screening'

describe('MockScreeningProvider', { concurrency: 1 }, () => {
  const provider = new MockScreeningProvider()

  it('returns deterministic results for same email', async () => {
    const req = {
      applicationId: 'app1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      monthlyIncome: 5000,
      desiredRent: 1200,
    }
    const r1 = await provider.runScreening(req)
    const r2 = await provider.runScreening(req)
    assert.equal(r1.creditScore, r2.creditScore)
    assert.equal(r1.creditStatus, r2.creditStatus)
    assert.equal(r1.backgroundStatus, r2.backgroundStatus)
    assert.equal(r1.evictionStatus, r2.evictionStatus)
    assert.equal(r1.incomeStatus, r2.incomeStatus)
    assert.equal(r1.overallStatus, r2.overallStatus)
  })

  it('produces credit score in 580-820 range', async () => {
    const emails = ['a@test.com', 'b@test.com', 'z@test.com', 'long-email-address@domain.co']
    for (const email of emails) {
      const r = await provider.runScreening({
        applicationId: 'app',
        firstName: 'A',
        lastName: 'B',
        email,
      })
      assert.ok(r.creditScore >= 580, `score ${r.creditScore} < 580 for ${email}`)
      assert.ok(r.creditScore <= 820, `score ${r.creditScore} > 820 for ${email}`)
    }
  })

  it('maps credit score >= 700 to CLEAR', async () => {
    // Use known email that produces score >= 700
    // We test via thresholds
    const r = await provider.runScreening({
      applicationId: 'app',
      firstName: 'A',
      lastName: 'B',
      email: 'test@test.com',
    })
    if (r.creditScore >= 700) {
      assert.equal(r.creditStatus, 'CLEAR')
    } else if (r.creditScore >= 620) {
      assert.equal(r.creditStatus, 'FLAG')
    } else {
      assert.equal(r.creditStatus, 'FAIL')
    }
  })

  it('computes income ratio correctly', async () => {
    const r = await provider.runScreening({
      applicationId: 'app',
      firstName: 'A',
      lastName: 'B',
      email: 'income@test.com',
      monthlyIncome: 5000,
      desiredRent: 1500,
    })
    assert.equal(r.incomeVerified, true)
    assert.equal(r.incomeRatio, 0.3)
    assert.equal(r.incomeStatus, 'CLEAR')
  })

  it('flags income ratio above 30%', async () => {
    const r = await provider.runScreening({
      applicationId: 'app',
      firstName: 'A',
      lastName: 'B',
      email: 'income@test.com',
      monthlyIncome: 3000,
      desiredRent: 1050,
    })
    assert.equal(r.incomeVerified, true)
    assert.equal(r.incomeStatus, 'FLAG')
  })

  it('fails income ratio above 40%', async () => {
    const r = await provider.runScreening({
      applicationId: 'app',
      firstName: 'A',
      lastName: 'B',
      email: 'income@test.com',
      monthlyIncome: 2000,
      desiredRent: 1000,
    })
    assert.equal(r.incomeVerified, true)
    assert.equal(r.incomeStatus, 'FAIL')
  })

  it('skips income check when no income provided', async () => {
    const r = await provider.runScreening({
      applicationId: 'app',
      firstName: 'A',
      lastName: 'B',
      email: 'noincome@test.com',
    })
    assert.equal(r.incomeVerified, false)
    assert.equal(r.incomeRatio, null)
    assert.equal(r.incomeStatus, 'CLEAR')
  })

  it('sets overall to FAIL if any check fails', async () => {
    // Income fail: rent/income > 40%
    const r = await provider.runScreening({
      applicationId: 'app',
      firstName: 'A',
      lastName: 'B',
      email: 'good-credit-test@example.com',
      monthlyIncome: 1000,
      desiredRent: 500,
    })
    if (r.creditStatus === 'FAIL' || r.backgroundStatus === 'FAIL' || r.evictionStatus === 'FAIL' || r.incomeStatus === 'FAIL') {
      assert.equal(r.overallStatus, 'FAIL')
    } else if (r.creditStatus === 'FLAG' || r.backgroundStatus === 'FLAG' || r.evictionStatus === 'FLAG' || r.incomeStatus === 'FLAG') {
      assert.equal(r.overallStatus, 'FLAG')
    } else {
      assert.equal(r.overallStatus, 'CLEAR')
    }
  })

  it('returns a providerRef starting with mock-', async () => {
    const r = await provider.runScreening({
      applicationId: 'app',
      firstName: 'A',
      lastName: 'B',
      email: 'ref@test.com',
    })
    assert.ok(r.providerRef.startsWith('mock-'))
  })

  it('includes rawResponse with provider=mock', async () => {
    const r = await provider.runScreening({
      applicationId: 'app',
      firstName: 'A',
      lastName: 'B',
      email: 'raw@test.com',
    })
    assert.equal(r.rawResponse.provider, 'mock')
    assert.ok(r.rawResponse.timestamp)
  })
})
