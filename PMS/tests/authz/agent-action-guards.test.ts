import test from 'node:test'
import assert from 'node:assert/strict'
import { executeAction } from '@/lib/agent'
import { prisma } from '@/lib/prisma'

function makeAction(overrides: Record<string, unknown>) {
  return {
    id: 'act-1',
    managerId: 'mgr-1',
    propertyId: null,
    actionType: 'SEND_MESSAGE',
    status: 'PENDING_APPROVAL',
    title: 't',
    reasoning: 'r',
    payload: { threadId: 'thread-1', body: 'Hello' },
    result: null,
    entityType: null,
    entityId: null,
    createdAt: new Date(),
    executedAt: null,
    respondedAt: null,
    ...overrides,
  } as any
}

test('executeAction rejects manager mismatch before execution', async () => {
  const action = makeAction({ managerId: 'mgr-1' })
  const res = await executeAction(action, 'mgr-2')
  assert.equal(res.ok, false)
  assert.equal(res.error, 'Forbidden: action manager mismatch')
})

test('executeAction rejects SEND_MESSAGE for thread outside manager scope', async () => {
  const originalFindFirst = (prisma.messageThread as any).findFirst

  try {
    ;(prisma.messageThread as any).findFirst = async () => null
    const action = makeAction({
      actionType: 'SEND_MESSAGE',
      payload: { threadId: 'thread-outside', body: 'Hello tenant' },
    })

    const res = await executeAction(action, 'mgr-1')
    assert.equal(res.ok, false)
    assert.equal(res.error, 'Forbidden: thread is outside manager scope')
  } finally {
    ;(prisma.messageThread as any).findFirst = originalFindFirst
  }
})
