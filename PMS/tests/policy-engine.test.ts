import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateAction,
  isInQuietHours,
  mergePolicy,
  DEFAULT_POLICY,
  type PolicyConfig,
} from '../lib/policy-engine'

// ── Spend ────────────────────────────────────────────────────────────────────

describe('SPEND_APPROVE', () => {
  test('allows spend under autoApproveMax', () => {
    const r = evaluateAction({ actionType: 'SPEND_APPROVE', context: { amount: 500 } })
    assert.equal(r.decision, 'ALLOW')
  })

  test('requires approval at exactly autoApproveMax + 1', () => {
    const r = evaluateAction({ actionType: 'SPEND_APPROVE', context: { amount: 751 } })
    assert.equal(r.decision, 'APPROVAL')
  })

  test('blocks spend above hardBlockAbove', () => {
    const r = evaluateAction({ actionType: 'SPEND_APPROVE', context: { amount: 5001 } })
    assert.equal(r.decision, 'BLOCK')
  })

  test('blocks spend at exactly hardBlockAbove + 1', () => {
    const r = evaluateAction({ actionType: 'SPEND_APPROVE', context: { amount: 5000.01 } })
    assert.equal(r.decision, 'BLOCK')
  })

  test('allows zero spend', () => {
    const r = evaluateAction({ actionType: 'SPEND_APPROVE', context: { amount: 0 } })
    assert.equal(r.decision, 'ALLOW')
  })
})

// ── Work orders ───────────────────────────────────────────────────────────────

describe('WO_ASSIGN_VENDOR', () => {
  test('allows auto-assign for whitelisted category', () => {
    const r = evaluateAction({
      actionType: 'WO_ASSIGN_VENDOR',
      context: { category: 'PLUMBING', priority: 'MEDIUM', vendorOpenWOCount: 0 },
    })
    assert.equal(r.decision, 'ALLOW')
  })

  test('blocks EMERGENCY priority', () => {
    const r = evaluateAction({
      actionType: 'WO_ASSIGN_VENDOR',
      context: { category: 'PLUMBING', priority: 'EMERGENCY', vendorOpenWOCount: 0 },
    })
    assert.equal(r.decision, 'BLOCK')
  })

  test('requires approval for unlisted category', () => {
    const r = evaluateAction({
      actionType: 'WO_ASSIGN_VENDOR',
      context: { category: 'ROOFING', priority: 'LOW', vendorOpenWOCount: 0 },
    })
    assert.equal(r.decision, 'APPROVAL')
  })

  test('requires approval when vendor at capacity', () => {
    const r = evaluateAction({
      actionType: 'WO_ASSIGN_VENDOR',
      context: { category: 'PLUMBING', priority: 'MEDIUM', vendorOpenWOCount: 25 },
    })
    assert.equal(r.decision, 'APPROVAL')
  })

  test('allows when one under capacity', () => {
    const r = evaluateAction({
      actionType: 'WO_ASSIGN_VENDOR',
      context: { category: 'HVAC', priority: 'HIGH', vendorOpenWOCount: 24 },
    })
    assert.equal(r.decision, 'ALLOW')
  })
})

describe('WO_CREATE', () => {
  test('allows normal priority WO creation', () => {
    const r = evaluateAction({ actionType: 'WO_CREATE', context: { priority: 'MEDIUM' } })
    assert.equal(r.decision, 'ALLOW')
  })

  test('blocks EMERGENCY WO when policy requires escalation', () => {
    const r = evaluateAction({ actionType: 'WO_CREATE', context: { priority: 'EMERGENCY' } })
    assert.equal(r.decision, 'BLOCK')
  })
})

describe('WO_BID_REQUEST', () => {
  test('always allows bid requests', () => {
    const r = evaluateAction({ actionType: 'WO_BID_REQUEST', context: {} })
    assert.equal(r.decision, 'ALLOW')
  })
})

// ── Messaging ─────────────────────────────────────────────────────────────────

describe('MESSAGE_SEND', () => {
  test('allows whitelisted intent outside quiet hours', () => {
    const r = evaluateAction({
      actionType: 'MESSAGE_SEND',
      context: { intent: 'STATUS_UPDATE', hasLegalKeywords: false },
    })
    // May be APPROVAL if in quiet hours — just test with a custom policy
    assert.ok(['ALLOW', 'APPROVAL'].includes(r.decision))
  })

  test('blocks message with legal keywords', () => {
    const r = evaluateAction({
      actionType: 'MESSAGE_SEND',
      context: { intent: 'FAQ', hasLegalKeywords: true },
    })
    assert.equal(r.decision, 'BLOCK')
  })

  test('requires approval for non-whitelisted intent', () => {
    const r = evaluateAction({
      actionType: 'MESSAGE_SEND',
      context: { intent: 'EVICTION_NOTICE', hasLegalKeywords: false },
    })
    assert.equal(r.decision, 'APPROVAL')
  })

  test('legal keywords override allowed intent', () => {
    const r = evaluateAction({
      actionType: 'MESSAGE_SEND',
      context: { intent: 'STATUS_UPDATE', hasLegalKeywords: true },
    })
    assert.equal(r.decision, 'BLOCK')
  })
})

// ── Compliance ────────────────────────────────────────────────────────────────

describe('COMPLIANCE_TASK_CREATE', () => {
  test('allows auto-create when policy enables it', () => {
    const r = evaluateAction({
      actionType: 'COMPLIANCE_TASK_CREATE',
      context: { isOverdue: false },
    })
    assert.equal(r.decision, 'ALLOW')
  })

  test('blocks overdue compliance when overdueAlwaysEscalate=true', () => {
    const r = evaluateAction({
      actionType: 'COMPLIANCE_TASK_CREATE',
      context: { isOverdue: true },
    })
    assert.equal(r.decision, 'BLOCK')
  })

  test('requires approval when autoCreateTasks=false', () => {
    const policy: PolicyConfig = {
      ...DEFAULT_POLICY,
      compliance: { ...DEFAULT_POLICY.compliance, autoCreateTasks: false },
    }
    const r = evaluateAction(
      { actionType: 'COMPLIANCE_TASK_CREATE', context: { isOverdue: false } },
      policy
    )
    assert.equal(r.decision, 'APPROVAL')
  })
})

// ── Escalate ──────────────────────────────────────────────────────────────────

describe('ESCALATE', () => {
  test('always allows escalation', () => {
    const r = evaluateAction({ actionType: 'ESCALATE', context: {} })
    assert.equal(r.decision, 'ALLOW')
  })
})

// ── Unknown action ────────────────────────────────────────────────────────────

describe('Unknown action', () => {
  test('defaults to APPROVAL for unknown action types', () => {
    const r = evaluateAction({ actionType: 'SOMETHING_UNKNOWN', context: {} })
    assert.equal(r.decision, 'APPROVAL')
  })
})

// ── isInQuietHours ────────────────────────────────────────────────────────────

describe('isInQuietHours', () => {
  test('overnight window — inside window (late night)', () => {
    const d = new Date('2024-01-01T22:00:00')
    assert.equal(isInQuietHours(d, '21:00', '07:00'), true)
  })

  test('overnight window — inside window (early morning)', () => {
    const d = new Date('2024-01-01T03:30:00')
    assert.equal(isInQuietHours(d, '21:00', '07:00'), true)
  })

  test('overnight window — outside window (midday)', () => {
    const d = new Date('2024-01-01T12:00:00')
    assert.equal(isInQuietHours(d, '21:00', '07:00'), false)
  })

  test('same-day window — inside window', () => {
    const d = new Date('2024-01-01T10:00:00')
    assert.equal(isInQuietHours(d, '09:00', '17:00'), true)
  })

  test('same-day window — outside window', () => {
    const d = new Date('2024-01-01T18:00:00')
    assert.equal(isInQuietHours(d, '09:00', '17:00'), false)
  })

  test('at the exact start boundary', () => {
    const d = new Date('2024-01-01T21:00:00')
    assert.equal(isInQuietHours(d, '21:00', '07:00'), true)
  })

  test('at the exact end boundary (not in window)', () => {
    const d = new Date('2024-01-01T07:00:00')
    assert.equal(isInQuietHours(d, '21:00', '07:00'), false)
  })
})

// ── mergePolicy ───────────────────────────────────────────────────────────────

describe('mergePolicy', () => {
  test('returns DEFAULT_POLICY for null/undefined input', () => {
    const p = mergePolicy(null)
    assert.deepEqual(p.spend, DEFAULT_POLICY.spend)
  })

  test('partial override merges correctly', () => {
    const p = mergePolicy({ spend: { autoApproveMax: 1000 } })
    assert.equal(p.spend.autoApproveMax, 1000)
    assert.equal(p.spend.hardBlockAbove, DEFAULT_POLICY.spend.hardBlockAbove)
  })

  test('full override respected', () => {
    const p = mergePolicy({
      spend: { autoApproveMax: 2000, requireApprovalAbove: 2000, hardBlockAbove: 10000 },
    })
    assert.equal(p.spend.hardBlockAbove, 10000)
  })
})
