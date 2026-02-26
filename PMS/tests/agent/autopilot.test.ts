/**
 * tests/agent/autopilot.test.ts
 *
 * Phase 1 DoD — automated tests for:
 *   - Idempotency (same event + same hour → skip)
 *   - Run failure paths (property not found, entity not found)
 *   - Escalation paths (CRITICAL incident, no vendor, capacity block)
 *   - Success paths (happy paths → COMPLETED)
 *   - Step lifecycle (every step reaches a terminal state)
 *
 * CONCURRENCY NOTE: Pure/idempotency describe blocks can run concurrently (no
 * shared mutable state). Integration tests that monkey-patch the prisma singleton
 * must run sequentially — they are all nested inside a single describe with
 * { concurrency: 1 }.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../../lib/prisma'
import { makeDedupeKey } from '../../lib/agent-runtime'
import { runMaintenanceAutopilot } from '../../lib/workflows/maintenance-autopilot'

// ─────────────────────────────────────────────────────────────────────────────
// Mock infrastructure
// ─────────────────────────────────────────────────────────────────────────────

interface MockState {
  runStatuses: string[]
  exceptionsCreated: Array<Record<string, unknown>>
  stepsCreated: number
  stepStatuses: Array<{ id: string; status: string }>
  workOrdersCreated: number
  workOrdersUpdated: number
}

function newMockState(): MockState {
  return {
    runStatuses: [],
    exceptionsCreated: [],
    stepsCreated: 0,
    stepStatuses: [],
    workOrdersCreated: 0,
    workOrdersUpdated: 0,
  }
}

/**
 * A valid work order stub used as the default return for workOrder.findUnique.
 * This ensures assignVendorStep proceeds past the null-guard and reaches vendor logic.
 */
const DEFAULT_WO = {
  id: 'mock-wo',
  category: 'GENERAL',
  priority: 'MEDIUM' as const,
  title: 'Mock Work Order',
  unitId: null,
}

/**
 * Install default mocks on the shared prisma singleton. Returns saved originals
 * so they can be restored in a finally block.
 */
function installMocks(ms: MockState) {
  const saved = {
    agentRunUpdate:        (prisma.agentRun as any).update,
    agentStepCreate:       (prisma.agentStep as any).create,
    agentStepUpdate:       (prisma.agentStep as any).update,
    agentActionLogCreate:  (prisma.agentActionLog as any).create,
    agentExceptionCreate:  (prisma.agentException as any).create,
    agentPolicyFindMany:   (prisma.agentPolicy as any).findMany,
    notificationCreate:    (prisma.notification as any).create,
    propertyFindUnique:    (prisma.property as any).findUnique,
    incidentFindUnique:    (prisma.incident as any).findUnique,
    pmScheduleFindUnique:  (prisma.pMSchedule as any).findUnique,
    pmScheduleUpdate:      (prisma.pMSchedule as any).update,
    workOrderFindFirst:    (prisma.workOrder as any).findFirst,
    workOrderFindUnique:   (prisma.workOrder as any).findUnique,
    workOrderCreate:       (prisma.workOrder as any).create,
    workOrderUpdate:       (prisma.workOrder as any).update,
    workOrderCount:        (prisma.workOrder as any).count,
    vendorFindMany:        (prisma.vendor as any).findMany,
    leaseFindFirst:        (prisma.lease as any).findFirst,
  }

  let stepCounter = 0

  // Run lifecycle
  ;(prisma.agentRun as any).update = async (args: any) => {
    if (args.data?.status) ms.runStatuses.push(args.data.status)
  }

  // Step lifecycle
  ;(prisma.agentStep as any).create = async () => {
    ms.stepsCreated++
    return { id: `step-${++stepCounter}` }
  }
  ;(prisma.agentStep as any).update = async (args: any) => {
    if (args.data?.status) ms.stepStatuses.push({ id: args.where.id, status: args.data.status })
  }

  // Logs / exceptions / notifications
  ;(prisma.agentActionLog as any).create  = async () => ({})
  ;(prisma.agentException as any).create  = async (args: any) => {
    ms.exceptionsCreated.push(args.data)
    return { id: `ex-${ms.exceptionsCreated.length}` }
  }
  ;(prisma.notification as any).create    = async () => ({})

  // Policy — empty list → loadPolicyForProperty falls back to DEFAULT_POLICY
  ;(prisma.agentPolicy as any).findMany   = async () => []

  // Property — valid property with a manager by default
  ;(prisma.property as any).findUnique    = async () => ({
    id: 'prop-1',
    name: 'Sunset Apartments',
    managerId: 'manager-1',
  })

  // Entities — null by default; tests override per scenario
  ;(prisma.incident as any).findUnique    = async () => null
  ;(prisma.pMSchedule as any).findUnique  = async () => null
  ;(prisma.pMSchedule as any).update      = async () => ({})

  // Work order — findFirst returns null (no pre-existing WO); findUnique returns a
  // valid stub so that assignVendorStep can proceed to the vendor-selection logic.
  ;(prisma.workOrder as any).findFirst    = async () => null
  ;(prisma.workOrder as any).findUnique   = async () => ({ ...DEFAULT_WO })
  ;(prisma.workOrder as any).create       = async () => {
    ms.workOrdersCreated++
    return { id: `wo-${ms.workOrdersCreated}` }
  }
  ;(prisma.workOrder as any).update       = async () => {
    ms.workOrdersUpdated++
    return {}
  }
  ;(prisma.workOrder as any).count        = async () => 0

  // Vendor — no vendors by default; tests override with available vendors
  ;(prisma.vendor as any).findMany        = async () => []
  ;(prisma.lease as any).findFirst        = async () => null

  return saved
}

function restoreMocks(saved: ReturnType<typeof installMocks>) {
  ;(prisma.agentRun as any).update         = saved.agentRunUpdate
  ;(prisma.agentStep as any).create        = saved.agentStepCreate
  ;(prisma.agentStep as any).update        = saved.agentStepUpdate
  ;(prisma.agentActionLog as any).create   = saved.agentActionLogCreate
  ;(prisma.agentException as any).create   = saved.agentExceptionCreate
  ;(prisma.agentPolicy as any).findMany    = saved.agentPolicyFindMany
  ;(prisma.notification as any).create     = saved.notificationCreate
  ;(prisma.property as any).findUnique     = saved.propertyFindUnique
  ;(prisma.incident as any).findUnique     = saved.incidentFindUnique
  ;(prisma.pMSchedule as any).findUnique   = saved.pmScheduleFindUnique
  ;(prisma.pMSchedule as any).update       = saved.pmScheduleUpdate
  ;(prisma.workOrder as any).findFirst     = saved.workOrderFindFirst
  ;(prisma.workOrder as any).findUnique    = saved.workOrderFindUnique
  ;(prisma.workOrder as any).create        = saved.workOrderCreate
  ;(prisma.workOrder as any).update        = saved.workOrderUpdate
  ;(prisma.workOrder as any).count         = saved.workOrderCount
  ;(prisma.vendor as any).findMany         = saved.vendorFindMany
  ;(prisma.lease as any).findFirst         = saved.leaseFindFirst
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. makeDedupeKey — pure unit tests (no shared state, safe to run concurrently)
// ─────────────────────────────────────────────────────────────────────────────

describe('makeDedupeKey — pure idempotency key', () => {
  test('produces deterministic key for same inputs', () => {
    const k1 = makeDedupeKey('event', 'PM_DUE-sched-1', 'prop-1', '2026-02-26T14')
    const k2 = makeDedupeKey('event', 'PM_DUE-sched-1', 'prop-1', '2026-02-26T14')
    assert.equal(k1, k2)
  })

  test('different entityId produces different key', () => {
    const k1 = makeDedupeKey('event', 'PM_DUE-sched-1', 'prop-1', '2026-02-26T14')
    const k2 = makeDedupeKey('event', 'PM_DUE-sched-2', 'prop-1', '2026-02-26T14')
    assert.notEqual(k1, k2)
  })

  test('different hour bucket produces different key', () => {
    const k1 = makeDedupeKey('event', 'PM_DUE-sched-1', 'prop-1', '2026-02-26T14')
    const k2 = makeDedupeKey('event', 'PM_DUE-sched-1', 'prop-1', '2026-02-26T15')
    assert.notEqual(k1, k2)
  })

  test('different propertyId produces different key', () => {
    const k1 = makeDedupeKey('event', 'PM_DUE-sched-1', 'prop-1', '2026-02-26T14')
    const k2 = makeDedupeKey('event', 'PM_DUE-sched-1', 'prop-2', '2026-02-26T14')
    assert.notEqual(k1, k2)
  })

  test('null propertyId produces empty segment in key', () => {
    const k = makeDedupeKey('event', 'PM_DUE-sched-1', null, '2026-02-26T14')
    const parts = k.split('|')
    assert.equal(parts[2], '', 'null propertyId should produce an empty segment')
  })

  test('key format contains all four pipe-delimited segments', () => {
    const k = makeDedupeKey('event', 'PM_DUE-sched-1', 'prop-1', '2026-02-26T14')
    const parts = k.split('|')
    assert.equal(parts.length, 4)
    assert.equal(parts[0], 'event')
    assert.equal(parts[1], 'PM_DUE-sched-1')
    assert.equal(parts[2], 'prop-1')
    assert.equal(parts[3], '2026-02-26T14')
  })

  test('same event + same hour = same key (core idempotency invariant)', () => {
    const hour = new Date().toISOString().slice(0, 13)
    const k1 = makeDedupeKey('event', 'NEW_INCIDENT-inc-99', 'prop-A', hour)
    const k2 = makeDedupeKey('event', 'NEW_INCIDENT-inc-99', 'prop-A', hour)
    assert.equal(k1, k2)
  })

  test('next hour breaks idempotency (no false deduplication across hours)', () => {
    const hour1 = '2026-02-26T14'
    const hour2 = '2026-02-26T15'
    const k1 = makeDedupeKey('event', 'PM_DUE-sched-99', 'prop-1', hour1)
    const k2 = makeDedupeKey('event', 'PM_DUE-sched-99', 'prop-1', hour2)
    assert.notEqual(k1, k2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Events route — idempotency (mocks agentRun.findFirst only, minimal overlap)
// ─────────────────────────────────────────────────────────────────────────────

describe('Events route — idempotency', () => {
  test('returns {skipped: true} when run already exists for dedupe key', async () => {
    const origFindFirst = (prisma.agentRun as any).findFirst
    const origCreate    = (prisma.agentRun as any).create
    try {
      ;(prisma.agentRun as any).findFirst = async () => ({ id: 'existing-run' })
      ;(prisma.agentRun as any).create    = async () => {
        throw new Error('agentRun.create must NOT be called on duplicate')
      }
      const { POST: eventsPost } = await import('../../app/api/agent/events/route')
      const req = new Request('http://localhost/api/agent/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: 'PM_DUE', entityId: 'sched-1', propertyId: 'prop-1' }),
      })
      const res  = await eventsPost(req)
      const data = await res.json()

      assert.equal(res.status, 200)
      assert.equal(data.ok, true)
      assert.equal(data.skipped, true)
      assert.equal(data.reason, 'duplicate')
    } finally {
      ;(prisma.agentRun as any).findFirst = origFindFirst
      ;(prisma.agentRun as any).create    = origCreate
    }
  })

  test('unknown event type → skip with "no workflow" reason (no run created)', async () => {
    const origFindFirst = (prisma.agentRun as any).findFirst
    const origCreate    = (prisma.agentRun as any).create
    try {
      ;(prisma.agentRun as any).findFirst = async () => null
      ;(prisma.agentRun as any).create    = async () => {
        throw new Error('agentRun.create must NOT be called for unmapped event')
      }
      const { POST: eventsPost } = await import('../../app/api/agent/events/route')
      const req = new Request('http://localhost/api/agent/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: 'COMPLETELY_UNKNOWN', entityId: 'x', propertyId: 'prop-1' }),
      })
      const data = await (await eventsPost(req)).json()
      assert.equal(data.skipped, true)
      assert.equal(data.reason, 'no workflow for event type')
    } finally {
      ;(prisma.agentRun as any).findFirst = origFindFirst
      ;(prisma.agentRun as any).create    = origCreate
    }
  })

  test('missing eventType returns 400', async () => {
    const origFindFirst = (prisma.agentRun as any).findFirst
    try {
      ;(prisma.agentRun as any).findFirst = async () => null
      const { POST: eventsPost } = await import('../../app/api/agent/events/route')
      const req = new Request('http://localhost/api/agent/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: 'prop-1' }),
      })
      const res = await eventsPost(req)
      assert.equal(res.status, 400)
    } finally {
      ;(prisma.agentRun as any).findFirst = origFindFirst
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3–6. Integration tests — SEQUENTIAL (concurrency: 1)
//
// All tests monkey-patch the shared prisma singleton. Nesting inside a single
// describe with concurrency:1 ensures no two tests run at the same time.
// ─────────────────────────────────────────────────────────────────────────────

describe('Autopilot — integration (sequential)', { concurrency: 1 }, () => {

  // ── Failure paths ──────────────────────────────────────────────────────────

  test('property not found → run marked FAILED', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.property as any).findUnique = async () => null

      await runMaintenanceAutopilot({
        runId: 'run-fail-prop',
        propertyId: 'prop-missing',
        triggerType: 'NEW_INCIDENT',
        entityId: 'incident-1',
      })

      assert.ok(ms.runStatuses.includes('RUNNING'), 'run should be started')
      assert.ok(ms.runStatuses.includes('FAILED'),  `Expected FAILED in ${JSON.stringify(ms.runStatuses)}`)
      assert.equal(ms.exceptionsCreated.length, 0,  'No exception before property lookup fails')
    } finally {
      restoreMocks(saved)
    }
  })

  test('PM schedule not found → run marked FAILED', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.pMSchedule as any).findUnique = async () => null

      await runMaintenanceAutopilot({
        runId: 'run-fail-sched',
        propertyId: 'prop-1',
        triggerType: 'PM_DUE',
        entityId: 'sched-missing',
      })

      assert.ok(ms.runStatuses.includes('FAILED'), `Expected FAILED in ${JSON.stringify(ms.runStatuses)}`)
    } finally {
      restoreMocks(saved)
    }
  })

  test('incident not found → step failed but run reaches terminal state', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.incident as any).findUnique = async () => null

      await runMaintenanceAutopilot({
        runId: 'run-fail-incident',
        propertyId: 'prop-1',
        triggerType: 'NEW_INCIDENT',
        entityId: 'incident-missing',
      })

      const terminal = ms.runStatuses.find(s => ['COMPLETED', 'ESCALATED', 'FAILED'].includes(s))
      assert.ok(terminal !== undefined, `Expected a terminal run status, got: ${ms.runStatuses}`)
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Escalation paths ───────────────────────────────────────────────────────

  test('CRITICAL incident → run ESCALATED + CRITICAL SAFETY exception created', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.incident as any).findUnique = async () => ({
        id: 'inc-critical',
        title: 'Gas leak detected',
        description: 'Strong smell of gas on floor 2',
        severity: 'CRITICAL',
        category: 'SAFETY',
      })

      await runMaintenanceAutopilot({
        runId: 'run-critical',
        propertyId: 'prop-1',
        triggerType: 'NEW_INCIDENT',
        entityId: 'inc-critical',
      })

      assert.ok(ms.runStatuses.includes('ESCALATED'), `Expected ESCALATED in ${JSON.stringify(ms.runStatuses)}`)
      assert.ok(ms.exceptionsCreated.length > 0, 'Expected exception to be created')
      assert.equal(ms.exceptionsCreated[0].severity, 'CRITICAL')
      assert.equal(ms.exceptionsCreated[0].category, 'SAFETY')
    } finally {
      restoreMocks(saved)
    }
  })

  test('HIGH incident + no eligible vendor → run ESCALATED + SLA exception', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.incident as any).findUnique = async () => ({
        id: 'inc-high',
        title: 'Water heater failure',
        description: 'No hot water in unit 3A',
        severity: 'HIGH',
        category: 'OTHER',
      })
      // Both vendor queries return empty
      ;(prisma.vendor as any).findMany = async () => []

      await runMaintenanceAutopilot({
        runId: 'run-no-vendor',
        propertyId: 'prop-1',
        triggerType: 'NEW_INCIDENT',
        entityId: 'inc-high',
      })

      assert.ok(ms.runStatuses.includes('ESCALATED'), `Expected ESCALATED in ${JSON.stringify(ms.runStatuses)}`)
      const slaEx = ms.exceptionsCreated.find(e => e.category === 'SLA')
      assert.ok(slaEx !== undefined, 'Expected an SLA exception when no vendor found')
    } finally {
      restoreMocks(saved)
    }
  })

  test('HIGH incident + all vendors at capacity (25 open) → ESCALATED + SLA exception', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.incident as any).findUnique = async () => ({
        id: 'inc-capacity',
        title: 'HVAC failure',
        description: 'Building-wide HVAC outage',
        severity: 'HIGH',
        category: 'OTHER',
      })
      // One vendor, but fully at capacity (policy threshold = 25)
      ;(prisma.vendor as any).findMany  = async () => [{ id: 'vendor-full', name: 'HVAC Pro' }]
      ;(prisma.workOrder as any).count  = async () => 25

      await runMaintenanceAutopilot({
        runId: 'run-capacity',
        propertyId: 'prop-1',
        triggerType: 'NEW_INCIDENT',
        entityId: 'inc-capacity',
      })

      assert.ok(ms.runStatuses.includes('ESCALATED'), `Expected ESCALATED in ${JSON.stringify(ms.runStatuses)}`)
      const slaEx = ms.exceptionsCreated.find(e => e.category === 'SLA')
      assert.ok(slaEx !== undefined, 'Expected SLA exception when vendor at capacity')
    } finally {
      restoreMocks(saved)
    }
  })

  test('UNASSIGNED_WO + no vendor → ESCALATED + SLA exception', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      // findUnique returns the WO so assignVendorStep proceeds to vendor lookup
      ;(prisma.workOrder as any).findUnique = async () => ({
        id: 'wo-unassigned',
        category: 'ELECTRICAL',
        priority: 'MEDIUM',
        title: 'Outlet sparking in unit 4B',
        unitId: null,
      })
      ;(prisma.vendor as any).findMany = async () => []

      await runMaintenanceAutopilot({
        runId: 'run-unassigned',
        propertyId: 'prop-1',
        triggerType: 'UNASSIGNED_WO',
        entityId: 'wo-unassigned',
      })

      assert.ok(ms.runStatuses.includes('ESCALATED'), `Expected ESCALATED in ${JSON.stringify(ms.runStatuses)}`)
      const slaEx = ms.exceptionsCreated.find(e => e.category === 'SLA')
      assert.ok(slaEx !== undefined, 'Expected SLA exception for UNASSIGNED_WO with no vendor')
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Success paths ──────────────────────────────────────────────────────────

  test('PM_DUE with eligible vendor under capacity → COMPLETED, no exceptions', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.pMSchedule as any).findUnique = async () => ({
        id: 'sched-hvac',
        title: 'HVAC Filter Replacement',
        description: 'Replace all air filters quarterly',
        frequencyDays: 90,
        nextDueAt: new Date('2026-02-26'),
        asset: { propertyId: 'prop-1', unitId: null },
      })
      ;(prisma.vendor as any).findMany = async () => [{ id: 'vendor-good', name: 'Filter Kings' }]
      ;(prisma.workOrder as any).count = async () => 3   // well under 25

      await runMaintenanceAutopilot({
        runId: 'run-pm-success',
        propertyId: 'prop-1',
        triggerType: 'PM_DUE',
        entityId: 'sched-hvac',
      })

      assert.ok(ms.runStatuses.includes('COMPLETED'), `Expected COMPLETED in ${JSON.stringify(ms.runStatuses)}`)
      assert.equal(ms.exceptionsCreated.length, 0, 'No exceptions on happy path')
      assert.ok(ms.workOrdersCreated > 0,  'Work order must be created')
      assert.ok(ms.workOrdersUpdated > 0,  'WO must be updated (vendor assigned)')
    } finally {
      restoreMocks(saved)
    }
  })

  test('PM_DUE reuses existing in-flight WO (idempotent WO creation)', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.pMSchedule as any).findUnique = async () => ({
        id: 'sched-fire',
        title: 'Fire Extinguisher Check',
        description: 'Annual inspection',
        frequencyDays: 365,
        nextDueAt: new Date('2026-02-26'),
        asset: { propertyId: 'prop-1', unitId: null },
      })
      // Existing open WO already present
      ;(prisma.workOrder as any).findFirst  = async () => ({ id: 'wo-existing-open' })
      ;(prisma.workOrder as any).findUnique = async () => ({
        id: 'wo-existing-open',
        category: 'GENERAL',
        priority: 'MEDIUM',
        title: 'PM: Fire Extinguisher Check',
        unitId: null,
      })
      ;(prisma.vendor as any).findMany = async () => [{ id: 'vendor-safe', name: 'SafetyFirst' }]
      ;(prisma.workOrder as any).count = async () => 0

      await runMaintenanceAutopilot({
        runId: 'run-pm-reuse',
        propertyId: 'prop-1',
        triggerType: 'PM_DUE',
        entityId: 'sched-fire',
      })

      assert.equal(ms.workOrdersCreated, 0, 'Existing WO must be reused — no new create')
      assert.ok(ms.runStatuses.includes('COMPLETED'), `Expected COMPLETED in ${JSON.stringify(ms.runStatuses)}`)
    } finally {
      restoreMocks(saved)
    }
  })

  test('HIGH incident + eligible vendor → COMPLETED, vendor assigned, no exceptions', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.incident as any).findUnique = async () => ({
        id: 'inc-resolved',
        title: 'Sink leaking',
        description: 'Kitchen sink slow drip in unit 2C',
        severity: 'HIGH',
        category: 'OTHER',
      })
      ;(prisma.vendor as any).findMany = async () => [{ id: 'vendor-plumb', name: 'Fix-It Plumbing' }]
      ;(prisma.workOrder as any).count = async () => 5   // under capacity

      await runMaintenanceAutopilot({
        runId: 'run-inc-success',
        propertyId: 'prop-1',
        triggerType: 'NEW_INCIDENT',
        entityId: 'inc-resolved',
      })

      assert.ok(ms.runStatuses.includes('COMPLETED'), `Expected COMPLETED in ${JSON.stringify(ms.runStatuses)}`)
      assert.equal(ms.exceptionsCreated.length, 0, 'No exceptions on clean incident resolution')
      assert.ok(ms.workOrdersCreated > 0,  'WO should be created from incident')
      assert.ok(ms.workOrdersUpdated > 0,  'Vendor should be assigned to WO')
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Step lifecycle ─────────────────────────────────────────────────────────

  test('each run creates at least one step', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.incident as any).findUnique = async () => ({
        id: 'inc-steps',
        title: 'Noise complaint',
        description: 'Loud music from unit 3',
        severity: 'LOW',
        category: 'OTHER',
      })
      ;(prisma.vendor as any).findMany = async () => [{ id: 'v-1', name: 'Vendor' }]
      ;(prisma.workOrder as any).count = async () => 0

      await runMaintenanceAutopilot({
        runId: 'run-steps-count',
        propertyId: 'prop-1',
        triggerType: 'NEW_INCIDENT',
        entityId: 'inc-steps',
      })

      assert.ok(ms.stepsCreated >= 1, `Expected ≥1 step, got ${ms.stepsCreated}`)
    } finally {
      restoreMocks(saved)
    }
  })

  test('every step that is created also reaches a terminal state (no PLANNED steps leak)', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.pMSchedule as any).findUnique = async () => ({
        id: 'sched-roof',
        title: 'Roof Inspection',
        description: 'Annual roof check',
        frequencyDays: 365,
        nextDueAt: new Date(),
        asset: { propertyId: 'prop-1', unitId: null },
      })
      ;(prisma.vendor as any).findMany = async () => [{ id: 'v-roof', name: 'RoofCo' }]
      ;(prisma.workOrder as any).count = async () => 0

      await runMaintenanceAutopilot({
        runId: 'run-steps-lifecycle',
        propertyId: 'prop-1',
        triggerType: 'PM_DUE',
        entityId: 'sched-roof',
      })

      // Each step goes through: startStep (RUNNING) + completeStep/failStep (terminal).
      // So statusUpdates per step = 2. Total status updates = stepsCreated × 2.
      const terminalStatuses = ['DONE', 'FAILED', 'SKIPPED']
      const terminalUpdates = ms.stepStatuses.filter(s => terminalStatuses.includes(s.status))
      assert.equal(
        terminalUpdates.length,
        ms.stepsCreated,
        `Every step must reach a terminal state. Created: ${ms.stepsCreated}, terminal: ${terminalUpdates.length}`
      )
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Retry / re-entrancy guard ──────────────────────────────────────────────

  test('idempotency: runExistsForKey prevents duplicate runs for same key', async () => {
    // Pure unit test of the dedupe helper — mock just findFirst on agentRun
    const orig = (prisma.agentRun as any).findFirst
    try {
      ;(prisma.agentRun as any).findFirst = async () => ({ id: 'already-exists' })
      const { runExistsForKey } = await import('../../lib/agent-runtime')
      const exists = await runExistsForKey('event|PM_DUE-sched-1|prop-1|2026-02-26T14')
      assert.equal(exists, true, 'runExistsForKey must return true when a run is found')
    } finally {
      ;(prisma.agentRun as any).findFirst = orig
    }
  })

  test('idempotency: runExistsForKey returns false when no prior run exists', async () => {
    const orig = (prisma.agentRun as any).findFirst
    try {
      ;(prisma.agentRun as any).findFirst = async () => null
      const { runExistsForKey } = await import('../../lib/agent-runtime')
      const exists = await runExistsForKey('event|PM_DUE-sched-NEW|prop-1|2026-02-26T14')
      assert.equal(exists, false, 'runExistsForKey must return false when no run found')
    } finally {
      ;(prisma.agentRun as any).findFirst = orig
    }
  })
})
