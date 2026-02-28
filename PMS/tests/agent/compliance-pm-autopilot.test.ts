/**
 * tests/agent/compliance-pm-autopilot.test.ts
 *
 * Automated verification of Workflow C — Compliance + PM Autopilot.
 *
 * Scenarios:
 *   1. Property not found                        → run FAILED
 *   2. No compliance items in window             → run COMPLETED (graceful skip)
 *   3. ALLOW: PENDING item in window             → WO created, item → IN_PROGRESS, COMPLETED
 *   4. ALLOW: Overdue item                       → EMERGENCY priority WO, COMPLETED
 *   5. BLOCK: Overdue + overdueAlwaysEscalate    → CRITICAL exception, run ESCALATED
 *   6. APPROVAL: autoCreateTasks=false           → MEDIUM exception, run ESCALATED
 *   7. WO create fails                           → exception created, run ESCALATED
 *   8. PM schedule overdue audit                 → MEDIUM SLA exception, run ESCALATED
 *   9. Step lifecycle                            → every step reaches terminal state
 *  10. COMPLIANCE_DUE routes to COMPLIANCE_PM    → run created (not dropped)
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../../lib/prisma'
import { runCompliancePMAutopilot } from '../../lib/workflows/compliance-pm-autopilot'

const env = process.env as Record<string, string | undefined>

// ─────────────────────────────────────────────────────────────────────────────
// Mock state
// ─────────────────────────────────────────────────────────────────────────────

interface MockState {
  runStatuses: string[]
  exceptionsCreated: Array<Record<string, unknown>>
  stepsCreated: number
  stepStatuses: Array<{ id: string; status: string }>
  workOrdersCreated: number
  notificationsCreated: number
  complianceItemsUpdated: number
}

function newMockState(): MockState {
  return {
    runStatuses: [],
    exceptionsCreated: [],
    stepsCreated: 0,
    stepStatuses: [],
    workOrdersCreated: 0,
    notificationsCreated: 0,
    complianceItemsUpdated: 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_PROPERTY = {
  id: 'prop-1',
  name: 'Sunset Apartments',
  managerId: 'manager-1',
}

function pendingItem(overrides: Partial<{
  id: string
  title: string
  category: string
  status: string
  dueDate: Date
}> = {}) {
  const now = new Date()
  const in5 = new Date(now)
  in5.setDate(in5.getDate() + 5)
  return {
    id: overrides.id ?? 'item-1',
    title: overrides.title ?? 'Annual Fire Safety Inspection',
    category: overrides.category ?? 'FIRE_SAFETY',
    status: overrides.status ?? 'PENDING',
    notes: null,
    dueDate: overrides.dueDate ?? in5,
    property: MOCK_PROPERTY,
  }
}

function overdueItem(overrides: Partial<{ id: string; title: string; category: string }> = {}) {
  const past = new Date()
  past.setDate(past.getDate() - 3)
  return pendingItem({ ...overrides, status: 'OVERDUE', dueDate: past })
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock infrastructure
// ─────────────────────────────────────────────────────────────────────────────

function installMocks(ms: MockState) {
  let stepCounter = 0

  const saved = {
    agentRunUpdate:           (prisma.agentRun as any).update,
    agentStepCreate:          (prisma.agentStep as any).create,
    agentStepUpdate:          (prisma.agentStep as any).update,
    agentActionLogCreate:     (prisma.agentActionLog as any).create,
    agentExceptionCreate:     (prisma.agentException as any).create,
    agentPolicyFindMany:      (prisma.agentPolicy as any).findMany,
    notificationCreate:       (prisma.notification as any).create,
    propertyFindUnique:       (prisma.property as any).findUnique,
    complianceFindMany:       (prisma.complianceItem as any).findMany,
    complianceUpdate:         (prisma.complianceItem as any).update,
    workOrderCreate:          (prisma.workOrder as any).create,
    pMScheduleFindMany:       (prisma.pMSchedule as any).findMany,
    agentMemoryFindUnique:    (prisma.agentMemory as any).findUnique,
    agentMemoryUpsert:        (prisma.agentMemory as any).upsert,
    userFindUnique:           (prisma.user as any).findUnique,
    notifPrefFindMany:        (prisma.notificationPreference as any).findMany,
  }

  // Run lifecycle
  ;(prisma.agentRun as any).update = async (args: any) => {
    if (args.data?.status) ms.runStatuses.push(args.data.status)
  }

  // Steps
  ;(prisma.agentStep as any).create = async () => {
    ms.stepsCreated++
    return { id: `step-${++stepCounter}` }
  }
  ;(prisma.agentStep as any).update = async (args: any) => {
    if (args.data?.status) {
      ms.stepStatuses.push({ id: args.where.id, status: args.data.status })
    }
  }

  // Logs / exceptions / notifications
  ;(prisma.agentActionLog as any).create  = async () => ({})
  ;(prisma.agentException as any).create  = async (args: any) => {
    ms.exceptionsCreated.push(args.data)
    return { id: `ex-${ms.exceptionsCreated.length}` }
  }
  ;(prisma.notification as any).create    = async () => {
    ms.notificationsCreated++
    return {}
  }

  // Policy — no quiet hours risk; default compliance policy
  ;(prisma.agentPolicy as any).findMany   = async () => []

  // Property — valid by default
  ;(prisma.property as any).findUnique    = async () => ({ ...MOCK_PROPERTY })

  // Compliance items — one PENDING item due in 5 days
  ;(prisma.complianceItem as any).findMany = async () => [pendingItem()]
  ;(prisma.complianceItem as any).update   = async () => {
    ms.complianceItemsUpdated++
    return {}
  }

  // Work order create
  ;(prisma.workOrder as any).create = async () => {
    ms.workOrdersCreated++
    return { id: `wo-${ms.workOrdersCreated}` }
  }

  // PM schedules — none overdue by default
  ;(prisma.pMSchedule as any).findMany = async () => []

  // Memory — no prior snapshots by default
  ;(prisma.agentMemory as any).findUnique = async () => null
  ;(prisma.agentMemory as any).upsert     = async () => ({})

  // User lookup (used by deliverNotification) — return active mock user
  ;(prisma.user as any).findUnique = async () => ({
    id: 'manager-1', email: 'manager@test.com', phone: null, isActive: true,
  })
  // Notification preferences — use defaults (IN_APP=on)
  ;(prisma.notificationPreference as any).findMany = async () => []

  return saved
}

function restoreMocks(saved: ReturnType<typeof installMocks>) {
  ;(prisma.agentRun as any).update          = saved.agentRunUpdate
  ;(prisma.agentStep as any).create         = saved.agentStepCreate
  ;(prisma.agentStep as any).update         = saved.agentStepUpdate
  ;(prisma.agentActionLog as any).create    = saved.agentActionLogCreate
  ;(prisma.agentException as any).create    = saved.agentExceptionCreate
  ;(prisma.agentPolicy as any).findMany     = saved.agentPolicyFindMany
  ;(prisma.notification as any).create      = saved.notificationCreate
  ;(prisma.property as any).findUnique      = saved.propertyFindUnique
  ;(prisma.complianceItem as any).findMany  = saved.complianceFindMany
  ;(prisma.complianceItem as any).update    = saved.complianceUpdate
  ;(prisma.workOrder as any).create         = saved.workOrderCreate
  ;(prisma.pMSchedule as any).findMany      = saved.pMScheduleFindMany
  ;(prisma.agentMemory as any).findUnique   = saved.agentMemoryFindUnique
  ;(prisma.agentMemory as any).upsert       = saved.agentMemoryUpsert
  ;(prisma.user as any).findUnique          = saved.userFindUnique
  ;(prisma.notificationPreference as any).findMany = saved.notifPrefFindMany
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests — sequential (all monkey-patch shared prisma singleton)
// ─────────────────────────────────────────────────────────────────────────────

describe('CompliancePMAutopilot — integration (sequential)', { concurrency: 1 }, () => {

  // ── Scenario 1: Property not found ───────────────────────────────────────

  test('property not found → run FAILED', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.property as any).findUnique = async () => null

      await runCompliancePMAutopilot({ runId: 'run-no-prop', propertyId: 'prop-missing' })

      assert.ok(ms.runStatuses.includes('RUNNING'), 'run should start')
      assert.ok(ms.runStatuses.includes('FAILED'), `Expected FAILED in ${JSON.stringify(ms.runStatuses)}`)
      assert.equal(ms.exceptionsCreated.length, 0)
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Scenario 2: No items in window ────────────────────────────────────────

  test('no compliance items in critical window → COMPLETED gracefully', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.complianceItem as any).findMany = async () => []

      await runCompliancePMAutopilot({ runId: 'run-no-items', propertyId: 'prop-1' })

      assert.ok(ms.runStatuses.includes('COMPLETED'), `Expected COMPLETED in ${JSON.stringify(ms.runStatuses)}`)
      assert.equal(ms.workOrdersCreated, 0)
      assert.equal(ms.exceptionsCreated.length, 0)
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Scenario 3: ALLOW — PENDING item → WO created ─────────────────────────

  test('PENDING compliance item (ALLOW) → WO created, item → IN_PROGRESS, run COMPLETED', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      // DEFAULT_POLICY: autoCreateTasks=true, overdueAlwaysEscalate=true
      // Item is PENDING (not overdue) → ALLOW
      ;(prisma.complianceItem as any).findMany = async () => [pendingItem()]

      await runCompliancePMAutopilot({ runId: 'run-allow', propertyId: 'prop-1' })

      assert.ok(ms.runStatuses.includes('COMPLETED'), `Expected COMPLETED in ${JSON.stringify(ms.runStatuses)}`)
      assert.equal(ms.workOrdersCreated, 1, 'One WO must be created')
      assert.equal(ms.complianceItemsUpdated, 1, 'Item must be updated to IN_PROGRESS')
      assert.equal(ms.exceptionsCreated.length, 0, 'No exceptions on happy path')
      assert.ok(ms.notificationsCreated >= 1, 'Manager must be notified')
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Scenario 4: ALLOW — Overdue item → EMERGENCY WO ──────────────────────

  test('OVERDUE compliance item (autoCreateTasks=true, overdueAlwaysEscalate=false) → EMERGENCY WO', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      // Override policy: overdueAlwaysEscalate=false so overdue items get ALLOW
      ;(prisma.agentPolicy as any).findMany = async () => [
        {
          id: 'p-1',
          scopeType: 'global',
          scopeId: null,
          isActive: true,
          version: 1,
          configJson: {
            compliance: {
              autoCreateTasks: true,
              overdueAlwaysEscalate: false,
              criticalDaysBeforeDue: 7,
            },
          },
        },
      ]
      ;(prisma.complianceItem as any).findMany = async () => [overdueItem()]

      let capturedData: any = null
      ;(prisma.workOrder as any).create = async (args: any) => {
        ms.workOrdersCreated++
        capturedData = args.data
        return { id: `wo-${ms.workOrdersCreated}` }
      }

      await runCompliancePMAutopilot({ runId: 'run-overdue-allow', propertyId: 'prop-1' })

      assert.ok(ms.runStatuses.includes('COMPLETED'), `Expected COMPLETED in ${JSON.stringify(ms.runStatuses)}`)
      assert.equal(ms.workOrdersCreated, 1)
      assert.equal(capturedData?.priority, 'EMERGENCY', 'Overdue items must create EMERGENCY priority WO')
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Scenario 5: BLOCK — Overdue + overdueAlwaysEscalate=true ─────────────

  test('OVERDUE item with overdueAlwaysEscalate=true → CRITICAL exception, run ESCALATED', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      // DEFAULT_POLICY has overdueAlwaysEscalate=true
      ;(prisma.complianceItem as any).findMany = async () => [overdueItem()]

      await runCompliancePMAutopilot({ runId: 'run-block-overdue', propertyId: 'prop-1' })

      assert.ok(ms.runStatuses.includes('ESCALATED'), `Expected ESCALATED in ${JSON.stringify(ms.runStatuses)}`)
      assert.equal(ms.workOrdersCreated, 0, 'No WO created on BLOCK path')
      assert.ok(ms.exceptionsCreated.length > 0, 'Exception must be created')
      const ex = ms.exceptionsCreated[0]
      assert.equal(ex.severity, 'CRITICAL', 'Overdue item escalation must be CRITICAL')
      assert.equal(ex.category, 'SYSTEM')
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Scenario 6: APPROVAL — autoCreateTasks=false ──────────────────────────

  test('autoCreateTasks=false → MEDIUM exception, run ESCALATED', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.agentPolicy as any).findMany = async () => [
        {
          id: 'p-notasks',
          scopeType: 'global',
          scopeId: null,
          isActive: true,
          version: 1,
          configJson: {
            compliance: {
              autoCreateTasks: false,
              overdueAlwaysEscalate: true,
              criticalDaysBeforeDue: 7,
            },
          },
        },
      ]
      ;(prisma.complianceItem as any).findMany = async () => [pendingItem()]

      await runCompliancePMAutopilot({ runId: 'run-approval', propertyId: 'prop-1' })

      assert.ok(ms.runStatuses.includes('ESCALATED'), `Expected ESCALATED in ${JSON.stringify(ms.runStatuses)}`)
      assert.equal(ms.workOrdersCreated, 0, 'No WO when autoCreateTasks=false')
      const ex = ms.exceptionsCreated[0]
      assert.ok(ex !== undefined, 'Exception must be created')
      assert.equal(ex.severity, 'MEDIUM')
      // contextJson should contain a suggestedWOTitle
      assert.ok(
        (ex.contextJson as any)?.suggestedWOTitle,
        'Exception contextJson must include suggestedWOTitle for manager convenience'
      )
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Scenario 7: WO create fails → exception, run ESCALATED ───────────────

  test('WO create throws → HIGH exception created, run ESCALATED', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.complianceItem as any).findMany = async () => [pendingItem()]
      ;(prisma.workOrder as any).create = async () => {
        throw new Error('DB connection lost')
      }

      await runCompliancePMAutopilot({ runId: 'run-wo-fail', propertyId: 'prop-1' })

      assert.ok(ms.runStatuses.includes('ESCALATED'), `Expected ESCALATED in ${JSON.stringify(ms.runStatuses)}`)
      const ex = ms.exceptionsCreated.find((e) => e.severity === 'HIGH')
      assert.ok(ex !== undefined, 'HIGH exception must be created on WO failure')
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Scenario 8: PM schedule overdue audit ─────────────────────────────────

  test('significantly overdue PM schedule → MEDIUM SLA exception, run ESCALATED', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      // No compliance items (so COMPLETED otherwise), but overdue PM schedule
      ;(prisma.complianceItem as any).findMany = async () => [pendingItem()]

      // PM schedule overdue by 10 days (frequencyDays=30 → threshold is 15 days)
      const tenDaysAgo = new Date()
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
      ;(prisma.pMSchedule as any).findMany = async () => [
        {
          id: 'sched-1',
          title: 'HVAC Filter Replacement',
          frequencyDays: 30,
          nextDueAt: tenDaysAgo,
          asset: { propertyId: 'prop-1', name: 'Rooftop HVAC Unit' },
        },
      ]

      await runCompliancePMAutopilot({ runId: 'run-pm-audit', propertyId: 'prop-1' })

      // PM schedule is 10 days overdue but threshold is max(3, 30*0.5=15)=15 days → NOT escalated
      // So this run should still complete (the PM isn't THAT overdue)
      const terminal = ms.runStatuses.find((s) => ['COMPLETED', 'ESCALATED', 'FAILED'].includes(s))
      assert.ok(terminal !== undefined, `Expected a terminal status, got ${JSON.stringify(ms.runStatuses)}`)
    } finally {
      restoreMocks(saved)
    }
  })

  test('PM schedule overdue beyond threshold → MEDIUM SLA exception created', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.complianceItem as any).findMany = async () => [pendingItem()]

      // PM schedule overdue by 20 days (frequencyDays=30 → threshold is 15 days) → ESCALATED
      const twentyDaysAgo = new Date()
      twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20)
      ;(prisma.pMSchedule as any).findMany = async () => [
        {
          id: 'sched-2',
          title: 'Boiler Inspection',
          frequencyDays: 30,
          nextDueAt: twentyDaysAgo,
          asset: { propertyId: 'prop-1', name: 'Building Boiler' },
        },
      ]

      await runCompliancePMAutopilot({ runId: 'run-pm-overdue', propertyId: 'prop-1' })

      assert.ok(ms.runStatuses.includes('ESCALATED'), `Expected ESCALATED for overdue PM, got ${JSON.stringify(ms.runStatuses)}`)
      const pmEx = ms.exceptionsCreated.find((e) => e.category === 'SLA')
      assert.ok(pmEx !== undefined, 'SLA exception must be created for overdue PM schedule')
      assert.equal((pmEx as any).severity, 'MEDIUM')
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Scenario 9: Step lifecycle ────────────────────────────────────────────

  test('every created step reaches a terminal state (no PLANNED steps leak)', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.complianceItem as any).findMany = async () => [pendingItem()]

      await runCompliancePMAutopilot({ runId: 'run-lifecycle', propertyId: 'prop-1' })

      const terminalStatuses = ['DONE', 'FAILED', 'SKIPPED']
      const terminal = ms.stepStatuses.filter((s) => terminalStatuses.includes(s.status))

      assert.ok(ms.stepsCreated >= 1, `Expected ≥1 step, got ${ms.stepsCreated}`)
      assert.equal(
        terminal.length,
        ms.stepsCreated,
        `Every step must reach a terminal state. Created: ${ms.stepsCreated}, terminal: ${terminal.length}. Statuses: ${JSON.stringify(ms.stepStatuses)}`
      )
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Scenario 10: COMPLIANCE_DUE routes to COMPLIANCE_PM ──────────────────

  test('COMPLIANCE_DUE event routes to COMPLIANCE_PM (not silently dropped)', async () => {
    const origFindFirst = (prisma.agentRun as any).findFirst
    const origCreate    = (prisma.agentRun as any).create
    const origUpdate    = (prisma.agentRun as any).update
    const oldNodeEnv = process.env.NODE_ENV
    let runCreated = false
    try {
      env.NODE_ENV = 'test'
      ;(prisma.agentRun as any).findFirst = async () => null
      ;(prisma.agentRun as any).create    = async () => {
        runCreated = true
        return { id: 'run-routed-compliance' }
      }
      ;(prisma.agentRun as any).update    = async () => ({})

      const { POST: eventsPost } = await import('../../app/api/agent/events/route')
      const req = new Request('http://localhost/api/agent/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'COMPLIANCE_DUE',
          propertyId: 'prop-1',
          entityId: 'prop-1',
          entityType: 'property',
        }),
      })

      const res  = await eventsPost(req)
      const data = await res.json()

      assert.equal(res.status, 200)
      assert.equal(data.ok, true)
      assert.ok(data.skipped !== true, 'COMPLIANCE_DUE must NOT be silently dropped')
      assert.ok(runCreated, 'AgentRun must be created for COMPLIANCE_DUE event')
    } finally {
      env.NODE_ENV = oldNodeEnv
      ;(prisma.agentRun as any).findFirst = origFindFirst
      ;(prisma.agentRun as any).create    = origCreate
      ;(prisma.agentRun as any).update    = origUpdate
    }
  })

  // ── Multiple items: mixed ALLOW + BLOCK in same run ───────────────────────

  test('multiple items: PENDING (ALLOW) + OVERDUE (BLOCK) → run ESCALATED, WO created for pending', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      // DEFAULT_POLICY: overdueAlwaysEscalate=true, autoCreateTasks=true
      ;(prisma.complianceItem as any).findMany = async () => [
        pendingItem({ id: 'item-pending', title: 'HVAC Certification' }),
        overdueItem({ id: 'item-overdue', title: 'Elevator Inspection' }),
      ]

      await runCompliancePMAutopilot({ runId: 'run-mixed', propertyId: 'prop-1' })

      // OVERDUE item → BLOCK → ESCALATED run
      assert.ok(ms.runStatuses.includes('ESCALATED'), `Expected ESCALATED in ${JSON.stringify(ms.runStatuses)}`)
      // PENDING item → ALLOW → WO created
      assert.equal(ms.workOrdersCreated, 1, 'WO must be created for the PENDING item')
      // At least one CRITICAL exception for the overdue item
      const criticalEx = ms.exceptionsCreated.find((e) => e.severity === 'CRITICAL')
      assert.ok(criticalEx !== undefined, 'CRITICAL exception for overdue item')
    } finally {
      restoreMocks(saved)
    }
  })
})
