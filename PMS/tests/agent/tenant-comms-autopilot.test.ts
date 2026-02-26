/**
 * tests/agent/tenant-comms-autopilot.test.ts
 *
 * Automated verification of Workflow B — Tenant Comms Autopilot.
 *
 * Scenarios covered (maps to plan verification steps 3-7):
 *   1. Thread not found           → run FAILED
 *   2. No tenant message          → run COMPLETED (graceful skip)
 *   3. MAINTENANCE_INTAKE intent  → ALLOW → WO created, reply posted, run COMPLETED
 *   4. Legal keyword ("lawsuit")  → BLOCK → CRITICAL LEGAL exception, run ESCALATED
 *   5. BILLING intent             → APPROVAL → draft exception, run ESCALATED
 *   6. Quiet-hours override       → APPROVAL (STATUS_UPDATE blocked by quiet hours)
 *   7. Step lifecycle             → every created step reaches a terminal state
 *
 * CONCURRENCY NOTE: All integration tests mutate shared singletons (prisma,
 * anthropic). They must run inside a single describe with { concurrency: 1 }.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../../lib/prisma'
import { anthropic } from '../../lib/ai'
import { runTenantCommsAutopilot } from '../../lib/workflows/tenant-comms-autopilot'

// ─────────────────────────────────────────────────────────────────────────────
// Mock state
// ─────────────────────────────────────────────────────────────────────────────

interface MockState {
  runStatuses: string[]
  exceptionsCreated: Array<Record<string, unknown>>
  stepsCreated: number
  stepStatuses: Array<{ id: string; status: string }>
  messagesCreated: number
  workOrdersCreated: number
  notificationsCreated: number
}

function newMockState(): MockState {
  return {
    runStatuses: [],
    exceptionsCreated: [],
    stepsCreated: 0,
    stepStatuses: [],
    messagesCreated: 0,
    workOrdersCreated: 0,
    notificationsCreated: 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Default fixtures
// ─────────────────────────────────────────────────────────────────────────────

const MAINTENANCE_BODY = 'My kitchen faucet is leaking badly. Please send someone to fix it.'

const MOCK_THREAD = {
  id: 'thread-1',
  subject: 'Leaking faucet in kitchen',
  status: 'OPEN',
  propertyId: 'prop-1',
  tenantId: 'tenant-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  messages: [
    {
      id: 'msg-1',
      threadId: 'thread-1',
      authorId: 'user-tenant-1',
      body: MAINTENANCE_BODY,
      readAt: null,
      createdAt: new Date(),
    },
  ],
  tenant: {
    id: 'tenant-1',
    userId: 'user-tenant-1',
    user: { id: 'user-tenant-1', name: 'Alice Tenant' },
  },
  property: {
    id: 'prop-1',
    name: 'Sunset Apartments',
    managerId: 'manager-1',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock infrastructure
// ─────────────────────────────────────────────────────────────────────────────

function installMocks(ms: MockState) {
  let stepCounter = 0

  const saved = {
    agentRunUpdate:        (prisma.agentRun as any).update,
    agentStepCreate:       (prisma.agentStep as any).create,
    agentStepUpdate:       (prisma.agentStep as any).update,
    agentActionLogCreate:  (prisma.agentActionLog as any).create,
    agentExceptionCreate:  (prisma.agentException as any).create,
    agentPolicyFindMany:   (prisma.agentPolicy as any).findMany,
    notificationCreate:    (prisma.notification as any).create,
    threadFindUnique:      (prisma.messageThread as any).findUnique,
    messageCreate:         (prisma.message as any).create,
    threadUpdate:          (prisma.messageThread as any).update,
    workOrderCreate:       (prisma.workOrder as any).create,
    tenantFindFirst:       (prisma.tenant as any).findFirst,
    leaseFindFirst:        (prisma.lease as any).findFirst,
    ledgerEntryFindMany:   (prisma.ledgerEntry as any).findMany,
    workOrderFindMany:     (prisma.workOrder as any).findMany,
    anthropicCreate:       (anthropic.messages as any).create,
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

  // Logs / exceptions / notifications (no-op by default; exceptions tracked)
  ;(prisma.agentActionLog as any).create  = async () => ({})
  ;(prisma.agentException as any).create  = async (args: any) => {
    ms.exceptionsCreated.push(args.data)
    return { id: `ex-${ms.exceptionsCreated.length}` }
  }
  ;(prisma.notification as any).create    = async () => {
    ms.notificationsCreated++
    return {}
  }

  // Policy — return a record with a narrow quiet-hours window (03:00–03:01) so
  // tests are never accidentally blocked by quiet hours, while still exercising
  // the real mergePolicy / loadPolicyForProperty code path.
  ;(prisma.agentPolicy as any).findMany   = async () => [
    {
      id: 'policy-test',
      scopeType: 'global',
      scopeId: null,
      isActive: true,
      version: 1,
      configJson: {
        messaging: {
          quietHours: { start: '03:00', end: '03:01' },
          allowedAutoIntents: ['STATUS_UPDATE', 'FAQ', 'MAINTENANCE_INTAKE', 'RENEWAL_INFO'],
          legalKeywordsEscalate: true,
        },
      },
    },
  ]

  // Thread — valid maintenance request by default
  ;(prisma.messageThread as any).findUnique = async () => ({ ...MOCK_THREAD, messages: [...MOCK_THREAD.messages] })

  // Reply message create
  ;(prisma.message as any).create = async () => {
    ms.messagesCreated++
    return { id: `reply-${ms.messagesCreated}` }
  }
  ;(prisma.messageThread as any).update = async () => ({})

  // Work order create
  ;(prisma.workOrder as any).create = async () => {
    ms.workOrdersCreated++
    return { id: `wo-${ms.workOrdersCreated}` }
  }

  // Context block helpers — return empty (non-fatal)
  ;(prisma.tenant as any).findFirst      = async () => null
  ;(prisma.lease as any).findFirst       = async () => null
  ;(prisma.ledgerEntry as any).findMany  = async () => []
  ;(prisma.workOrder as any).findMany    = async () => []

  // Anthropic — classification returns MAINTENANCE_INTAKE by default;
  // subsequent calls return a plain reply string.
  let anthropicCallCount = 0
  ;(anthropic.messages as any).create = async () => {
    anthropicCallCount++
    if (anthropicCallCount === 1) {
      return {
        content: [{ type: 'text', text: '{"intent":"MAINTENANCE_INTAKE","hasLegalKeywords":false}' }],
      }
    }
    return {
      content: [{ type: 'text', text: 'Your maintenance request has been logged and will be addressed within 24-48 hours.' }],
    }
  }

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
  ;(prisma.messageThread as any).findUnique = saved.threadFindUnique
  ;(prisma.message as any).create           = saved.messageCreate
  ;(prisma.messageThread as any).update     = saved.threadUpdate
  ;(prisma.workOrder as any).create         = saved.workOrderCreate
  ;(prisma.tenant as any).findFirst         = saved.tenantFindFirst
  ;(prisma.lease as any).findFirst          = saved.leaseFindFirst
  ;(prisma.ledgerEntry as any).findMany     = saved.ledgerEntryFindMany
  ;(prisma.workOrder as any).findMany       = saved.workOrderFindMany
  ;(anthropic.messages as any).create       = saved.anthropicCreate
}

// ─────────────────────────────────────────────────────────────────────────────
// Integration tests — SEQUENTIAL (all monkey-patch shared singletons)
// ─────────────────────────────────────────────────────────────────────────────

describe('TenantCommsAutopilot — integration (sequential)', { concurrency: 1 }, () => {

  // ── Scenario 1: Thread not found ──────────────────────────────────────────

  test('thread not found → run marked FAILED', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.messageThread as any).findUnique = async () => null

      await runTenantCommsAutopilot({
        runId: 'run-no-thread',
        propertyId: 'prop-1',
        threadId: 'thread-missing',
      })

      assert.ok(ms.runStatuses.includes('RUNNING'), 'run should be started')
      assert.ok(ms.runStatuses.includes('FAILED'), `Expected FAILED in ${JSON.stringify(ms.runStatuses)}`)
      assert.equal(ms.exceptionsCreated.length, 0, 'No exception created before thread lookup fails')
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Scenario 2: No tenant message in thread ───────────────────────────────

  test('thread has no tenant message → run COMPLETED gracefully (skip)', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      // Messages only from manager, none from the tenant user
      ;(prisma.messageThread as any).findUnique = async () => ({
        ...MOCK_THREAD,
        messages: [
          {
            id: 'msg-manager',
            threadId: 'thread-1',
            authorId: 'manager-1',   // NOT the tenant's userId
            body: 'Hi, how can I help you?',
            readAt: null,
            createdAt: new Date(),
          },
        ],
      })

      await runTenantCommsAutopilot({
        runId: 'run-no-tenant-msg',
        propertyId: 'prop-1',
        threadId: 'thread-1',
      })

      assert.ok(ms.runStatuses.includes('COMPLETED'), `Expected COMPLETED in ${JSON.stringify(ms.runStatuses)}`)
      assert.equal(ms.exceptionsCreated.length, 0, 'No exceptions when thread has no tenant message')
      assert.equal(ms.messagesCreated, 0, 'No reply created when no tenant message found')
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Scenario 3: MAINTENANCE_INTAKE → ALLOW path ───────────────────────────
  // Verification step 4: maintenance message creates WO + sends reply + COMPLETED

  test('MAINTENANCE_INTAKE message → ALLOW → WO created, reply posted, run COMPLETED', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      // Anthropic: call 1 = classify, call 2 = generate reply
      let callN = 0
      ;(anthropic.messages as any).create = async () => {
        callN++
        if (callN === 1) {
          return { content: [{ type: 'text', text: '{"intent":"MAINTENANCE_INTAKE","hasLegalKeywords":false}' }] }
        }
        return { content: [{ type: 'text', text: 'Your maintenance request has been logged as Work Order #wo-1.' }] }
      }

      await runTenantCommsAutopilot({
        runId: 'run-maintenance',
        propertyId: 'prop-1',
        threadId: 'thread-1',
      })

      assert.ok(ms.runStatuses.includes('COMPLETED'), `Expected COMPLETED in ${JSON.stringify(ms.runStatuses)}`)
      assert.equal(ms.exceptionsCreated.length, 0, 'No exceptions on MAINTENANCE_INTAKE happy path')
      assert.ok(ms.workOrdersCreated >= 1, 'Work order must be created for MAINTENANCE_INTAKE')
      assert.ok(ms.messagesCreated >= 1, 'Auto-reply must be posted to thread')
      assert.ok(ms.notificationsCreated >= 1, 'Tenant + manager should be notified')
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Scenario 4: Legal keywords → BLOCK path ───────────────────────────────
  // Verification step 5: "lawsuit" triggers CRITICAL LEGAL exception, run ESCALATED

  test('message with "lawsuit" → BLOCK → CRITICAL LEGAL exception, run ESCALATED', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      // Thread with legal keyword in message body
      ;(prisma.messageThread as any).findUnique = async () => ({
        ...MOCK_THREAD,
        subject: 'Serious problem',
        messages: [
          {
            id: 'msg-legal',
            threadId: 'thread-1',
            authorId: 'user-tenant-1',
            body: "This is unacceptable. I'm going to file a lawsuit if this isn't resolved immediately.",
            readAt: null,
            createdAt: new Date(),
          },
        ],
      })

      // Classification may return LEGAL, but hasLegalKeywords=true regardless (local scan also catches it)
      ;(anthropic.messages as any).create = async () => ({
        content: [{ type: 'text', text: '{"intent":"LEGAL","hasLegalKeywords":true}' }],
      })

      await runTenantCommsAutopilot({
        runId: 'run-legal',
        propertyId: 'prop-1',
        threadId: 'thread-1',
      })

      assert.ok(ms.runStatuses.includes('ESCALATED'), `Expected ESCALATED in ${JSON.stringify(ms.runStatuses)}`)
      assert.equal(ms.messagesCreated, 0, 'No auto-reply should be sent for legal content')
      assert.ok(ms.exceptionsCreated.length > 0, 'Exception must be created')
      const ex = ms.exceptionsCreated[0]
      assert.equal(ex.severity, 'CRITICAL', 'Exception must be CRITICAL severity')
      assert.equal(ex.category, 'LEGAL', 'Exception must have LEGAL category')
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Scenario 4b: Local keyword scan catches legal terms even if AI misses ──

  test('local keyword scan flags "attorney" even if AI returns OTHER intent', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.messageThread as any).findUnique = async () => ({
        ...MOCK_THREAD,
        messages: [
          {
            id: 'msg-atty',
            threadId: 'thread-1',
            authorId: 'user-tenant-1',
            body: "I've spoken to my attorney about this mold situation.",
            readAt: null,
            createdAt: new Date(),
          },
        ],
      })

      // AI incorrectly returns OTHER with no legal keywords — local scan should still catch it
      ;(anthropic.messages as any).create = async () => ({
        content: [{ type: 'text', text: '{"intent":"OTHER","hasLegalKeywords":false}' }],
      })

      await runTenantCommsAutopilot({
        runId: 'run-atty-scan',
        propertyId: 'prop-1',
        threadId: 'thread-1',
      })

      assert.ok(ms.runStatuses.includes('ESCALATED'), `Expected ESCALATED in ${JSON.stringify(ms.runStatuses)}`)
      assert.equal(ms.messagesCreated, 0, 'No auto-reply for legal content')
      const ex = ms.exceptionsCreated.find((e) => e.severity === 'CRITICAL' && e.category === 'LEGAL')
      assert.ok(ex !== undefined, 'CRITICAL LEGAL exception must be created even when AI misses legal keyword')
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Scenario 5: Intent not in allowedAutoIntents → APPROVAL path ──────────
  // Verification step 5 (non-legal path): BILLING triggers draft + escalation

  test('BILLING intent (not in allowedAutoIntents) → APPROVAL → draft exception, run ESCALATED', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.messageThread as any).findUnique = async () => ({
        ...MOCK_THREAD,
        subject: 'Question about my bill',
        messages: [
          {
            id: 'msg-billing',
            threadId: 'thread-1',
            authorId: 'user-tenant-1',
            body: "I was charged a late fee but I paid on time. Can you explain the charges?",
            readAt: null,
            createdAt: new Date(),
          },
        ],
      })

      // Classification: BILLING (not in DEFAULT_POLICY.allowedAutoIntents)
      let callN = 0
      ;(anthropic.messages as any).create = async () => {
        callN++
        if (callN === 1) {
          return { content: [{ type: 'text', text: '{"intent":"BILLING","hasLegalKeywords":false}' }] }
        }
        // Draft generation
        return { content: [{ type: 'text', text: 'Thank you for reaching out about your payment. We will review your account shortly.' }] }
      }

      await runTenantCommsAutopilot({
        runId: 'run-billing',
        propertyId: 'prop-1',
        threadId: 'thread-1',
      })

      assert.ok(ms.runStatuses.includes('ESCALATED'), `Expected ESCALATED in ${JSON.stringify(ms.runStatuses)}`)
      assert.equal(ms.messagesCreated, 0, 'No auto-reply sent in APPROVAL path — draft awaits manager review')
      assert.ok(ms.exceptionsCreated.length > 0, 'Exception must be created with draft for review')
      const ex = ms.exceptionsCreated[0]
      assert.equal(ex.severity, 'MEDIUM', 'APPROVAL path exception should be MEDIUM')
      assert.equal(ex.category, 'SYSTEM', 'APPROVAL path exception should be SYSTEM category')
      assert.ok(
        (ex.contextJson as any)?.draft,
        'Exception contextJson must contain the AI-generated draft'
      )
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Scenario 6: Quiet hours override → APPROVAL even for allowed intent ────
  // Verification step 7: STATUS_UPDATE is allowed but quiet hours blocks it

  test('STATUS_UPDATE during quiet hours → APPROVAL (not sent), run ESCALATED', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.messageThread as any).findUnique = async () => ({
        ...MOCK_THREAD,
        subject: 'Status of my work order?',
        messages: [
          {
            id: 'msg-status',
            threadId: 'thread-1',
            authorId: 'user-tenant-1',
            body: "Can you give me an update on when the repair will be done?",
            readAt: null,
            createdAt: new Date(),
          },
        ],
      })

      // Override policy: quiet hours = all day (00:00–23:59), always in quiet hours
      ;(prisma.agentPolicy as any).findMany = async () => [
        {
          id: 'policy-quiet',
          scopeType: 'global',
          scopeId: null,
          isActive: true,
          version: 1,
          configJson: {
            messaging: {
              quietHours: { start: '00:00', end: '23:59' },
              allowedAutoIntents: ['STATUS_UPDATE', 'FAQ', 'MAINTENANCE_INTAKE', 'RENEWAL_INFO'],
              legalKeywordsEscalate: true,
            },
          },
        },
      ]

      // Classification: STATUS_UPDATE (IS in allowedAutoIntents)
      let callN = 0
      ;(anthropic.messages as any).create = async () => {
        callN++
        if (callN === 1) {
          return { content: [{ type: 'text', text: '{"intent":"STATUS_UPDATE","hasLegalKeywords":false}' }] }
        }
        return { content: [{ type: 'text', text: 'Your work order is currently being processed.' }] }
      }

      await runTenantCommsAutopilot({
        runId: 'run-quiet-hours',
        propertyId: 'prop-1',
        threadId: 'thread-1',
      })

      // Should be APPROVAL because of quiet hours, not ALLOW
      assert.ok(ms.runStatuses.includes('ESCALATED'), `Expected ESCALATED in ${JSON.stringify(ms.runStatuses)}`)
      assert.equal(ms.messagesCreated, 0, 'No auto-reply during quiet hours — draft awaits review')
      const ex = ms.exceptionsCreated.find((e) => e.category === 'SYSTEM')
      assert.ok(ex !== undefined, 'SYSTEM exception should be created during quiet hours')
      // Confirm the policy reason mentions quiet hours
      assert.ok(
        (ex as any).details?.toLowerCase().includes('quiet'),
        `Exception details should mention quiet hours, got: ${(ex as any).details}`
      )
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Scenario 6b: FAQ intent → ALLOW → reply sent ──────────────────────────

  test('FAQ intent (in allowedAutoIntents, no legal, not quiet hours) → ALLOW → reply sent, COMPLETED', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      ;(prisma.messageThread as any).findUnique = async () => ({
        ...MOCK_THREAD,
        subject: 'Parking question',
        messages: [
          {
            id: 'msg-faq',
            threadId: 'thread-1',
            authorId: 'user-tenant-1',
            body: "Where can I park my second vehicle? Is there guest parking available?",
            readAt: null,
            createdAt: new Date(),
          },
        ],
      })

      let callN = 0
      ;(anthropic.messages as any).create = async () => {
        callN++
        if (callN === 1) {
          return { content: [{ type: 'text', text: '{"intent":"FAQ","hasLegalKeywords":false}' }] }
        }
        return { content: [{ type: 'text', text: 'Guest parking is available in the north lot. Please contact the office for a visitor pass.' }] }
      }

      await runTenantCommsAutopilot({
        runId: 'run-faq',
        propertyId: 'prop-1',
        threadId: 'thread-1',
      })

      assert.ok(ms.runStatuses.includes('COMPLETED'), `Expected COMPLETED in ${JSON.stringify(ms.runStatuses)}`)
      assert.ok(ms.messagesCreated >= 1, 'Auto-reply must be posted for FAQ intent')
      assert.equal(ms.workOrdersCreated, 0, 'No WO for FAQ intent')
      assert.equal(ms.exceptionsCreated.length, 0, 'No exceptions for FAQ happy path')
    } finally {
      restoreMocks(saved)
    }
  })

  // ── Scenario 7: Step lifecycle ─────────────────────────────────────────────
  // Every step that is created must also reach a terminal state

  test('every created step reaches a terminal state (no PLANNED steps leak)', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      // Use MAINTENANCE_INTAKE happy path (most steps)
      let callN = 0
      ;(anthropic.messages as any).create = async () => {
        callN++
        if (callN === 1) {
          return { content: [{ type: 'text', text: '{"intent":"MAINTENANCE_INTAKE","hasLegalKeywords":false}' }] }
        }
        return { content: [{ type: 'text', text: 'Your request has been logged.' }] }
      }

      await runTenantCommsAutopilot({
        runId: 'run-step-lifecycle',
        propertyId: 'prop-1',
        threadId: 'thread-1',
      })

      const terminalStatuses = ['DONE', 'FAILED', 'SKIPPED']
      const terminalUpdates = ms.stepStatuses.filter((s) => terminalStatuses.includes(s.status))

      assert.ok(ms.stepsCreated >= 1, `Expected ≥1 step, got ${ms.stepsCreated}`)
      assert.equal(
        terminalUpdates.length,
        ms.stepsCreated,
        `Every step must reach a terminal state. Created: ${ms.stepsCreated}, terminal: ${terminalUpdates.length}. Statuses: ${JSON.stringify(ms.stepStatuses)}`
      )
    } finally {
      restoreMocks(saved)
    }
  })

  // ── AI parse failure fallback ──────────────────────────────────────────────

  test('AI classification returns malformed JSON → falls back to OTHER intent → APPROVAL', async () => {
    const ms = newMockState()
    const saved = installMocks(ms)
    try {
      // AI returns garbage JSON
      let callN = 0
      ;(anthropic.messages as any).create = async () => {
        callN++
        if (callN === 1) {
          return { content: [{ type: 'text', text: 'Sorry, I cannot classify this.' }] }
        }
        return { content: [{ type: 'text', text: 'A team member will be in touch.' }] }
      }

      await runTenantCommsAutopilot({
        runId: 'run-parse-fail',
        propertyId: 'prop-1',
        threadId: 'thread-1',
      })

      // OTHER intent is not in allowedAutoIntents → APPROVAL → ESCALATED
      assert.ok(ms.runStatuses.includes('ESCALATED'), `Expected ESCALATED for OTHER intent, got ${JSON.stringify(ms.runStatuses)}`)
      assert.equal(ms.messagesCreated, 0, 'No auto-reply for unknown/OTHER intent')
    } finally {
      restoreMocks(saved)
    }
  })

  // ── NEW_MESSAGE_THREAD and NEW_MESSAGE route to TENANT_COMMS workflow ──────

  test('events route maps NEW_MESSAGE_THREAD to TENANT_COMMS (not silently dropped)', async () => {
    const origFindFirst = (prisma.agentRun as any).findFirst
    const origCreate    = (prisma.agentRun as any).create
    let runCreated = false
    try {
      ;(prisma.agentRun as any).findFirst = async () => null  // no dedupe hit
      ;(prisma.agentRun as any).create    = async () => {
        runCreated = true
        return { id: 'run-routed' }
      }

      const { POST: eventsPost } = await import('../../app/api/agent/events/route')
      const req = new Request('http://localhost/api/agent/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'NEW_MESSAGE_THREAD',
          propertyId: 'prop-1',
          entityId: 'thread-abc',
          entityType: 'message_thread',
        }),
      })

      const res  = await eventsPost(req)
      const data = await res.json()

      assert.equal(res.status, 200)
      assert.equal(data.ok, true)
      assert.ok(data.skipped !== true, 'NEW_MESSAGE_THREAD must NOT be silently dropped')
      assert.ok(runCreated, 'AgentRun must be created for NEW_MESSAGE_THREAD event')
    } finally {
      ;(prisma.agentRun as any).findFirst = origFindFirst
      ;(prisma.agentRun as any).create    = origCreate
    }
  })

  test('events route maps NEW_MESSAGE to TENANT_COMMS (reply in existing thread)', async () => {
    const origFindFirst = (prisma.agentRun as any).findFirst
    const origCreate    = (prisma.agentRun as any).create
    let runCreated = false
    try {
      ;(prisma.agentRun as any).findFirst = async () => null
      ;(prisma.agentRun as any).create    = async () => {
        runCreated = true
        return { id: 'run-new-msg' }
      }

      const { POST: eventsPost } = await import('../../app/api/agent/events/route')
      const req = new Request('http://localhost/api/agent/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'NEW_MESSAGE',
          propertyId: 'prop-1',
          entityId: 'thread-abc',
          entityType: 'message_thread',
        }),
      })

      const res  = await eventsPost(req)
      const data = await res.json()

      assert.equal(res.status, 200)
      assert.equal(data.ok, true)
      assert.ok(data.skipped !== true, 'NEW_MESSAGE must NOT be silently dropped')
      assert.ok(runCreated, 'AgentRun must be created for NEW_MESSAGE event')
    } finally {
      ;(prisma.agentRun as any).findFirst = origFindFirst
      ;(prisma.agentRun as any).create    = origCreate
    }
  })
})
