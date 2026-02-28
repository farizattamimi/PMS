import test from 'node:test'
import assert from 'node:assert/strict'
import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { sessionProvider } from '@/lib/session-provider'
import { GET as runsGET } from '@/app/api/agent/runs/route'
import { GET as runDetailGET } from '@/app/api/agent/runs/[id]/route'
import { POST as runCancelPOST } from '@/app/api/agent/runs/[id]/cancel/route'
import { GET as exceptionsGET } from '@/app/api/agent/exceptions/route'
import { PATCH as exceptionPATCH } from '@/app/api/agent/exceptions/[id]/route'
import { POST as exceptionDecisionPOST } from '@/app/api/agent/exceptions/[id]/decision/route'
import { GET as kpisGET } from '@/app/api/agent/kpis/route'
import { GET as runsStreamGET } from '@/app/api/agent/runs/stream/route'
import { GET as runStreamGET } from '@/app/api/agent/runs/[id]/stream/route'
import { POST as runAgentPOST } from '@/app/api/agent/run/route'
import { PATCH as settingsPATCH } from '@/app/api/agent/settings/route'
import { GET as policiesGET } from '@/app/api/agent/policies/route'
import { POST as policyEvaluatePOST } from '@/app/api/agent/policies/evaluate/route'

function makeSession(role: 'ADMIN' | 'MANAGER' | 'TENANT', id: string): Session {
  return {
    user: { id, systemRole: role, name: null, email: null, image: null, orgId: null },
    expires: '2099-01-01T00:00:00.000Z',
  }
}

test('GET /api/agent/runs scopes manager to owned properties', async () => {
  const originalGetSession = sessionProvider.getSession
  const originalPropertyFindMany = (prisma.property as any).findMany
  const originalRunFindMany = (prisma.agentRun as any).findMany
  let capturedWhere: any = null

  try {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.property as any).findMany = async () => [{ id: 'p-1' }, { id: 'p-2' }]
    ;(prisma.agentRun as any).findMany = async (args: any) => {
      capturedWhere = args.where
      return []
    }

    const res = await runsGET(new Request('http://localhost/api/agent/runs'))
    assert.equal(res.status, 200)
    assert.deepEqual(capturedWhere, { propertyId: { in: ['p-1', 'p-2'] } })
  } finally {
    sessionProvider.getSession = originalGetSession
    ;(prisma.property as any).findMany = originalPropertyFindMany
    ;(prisma.agentRun as any).findMany = originalRunFindMany
  }
})

test('GET /api/agent/runs denies non-manager/operator roles', async () => {
  const originalGetSession = sessionProvider.getSession
  try {
    sessionProvider.getSession = async () => ({
      user: { id: 'vendor-1', systemRole: 'VENDOR', name: null, email: null, image: null, orgId: null } as any,
      expires: '2099-01-01T00:00:00.000Z',
    } as Session)
    const res = await runsGET(new Request('http://localhost/api/agent/runs'))
    assert.equal(res.status, 401)
  } finally {
    sessionProvider.getSession = originalGetSession
  }
})

test('GET /api/agent/runs/[id] returns 404 for manager outside scope', async () => {
  const originalGetSession = sessionProvider.getSession
  const originalPropertyFindMany = (prisma.property as any).findMany
  const originalRunFindUnique = (prisma.agentRun as any).findUnique

  try {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.property as any).findMany = async () => [{ id: 'p-1' }]
    ;(prisma.agentRun as any).findUnique = async () => ({
      id: 'run-1',
      propertyId: 'p-999',
      steps: [],
      actionLogs: [],
      exceptions: [],
    })

    const res = await runDetailGET(new Request('http://localhost/api/agent/runs/run-1'), {
      params: { id: 'run-1' },
    })
    assert.equal(res.status, 404)
  } finally {
    sessionProvider.getSession = originalGetSession
    ;(prisma.property as any).findMany = originalPropertyFindMany
    ;(prisma.agentRun as any).findUnique = originalRunFindUnique
  }
})

test('POST /api/agent/runs/[id]/cancel returns 404 for manager outside scope', async () => {
  const originalGetSession = sessionProvider.getSession
  const originalPropertyFindMany = (prisma.property as any).findMany
  const originalRunFindUnique = (prisma.agentRun as any).findUnique

  try {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.property as any).findMany = async () => [{ id: 'p-1' }]
    ;(prisma.agentRun as any).findUnique = async () => ({ id: 'run-1', status: 'RUNNING', propertyId: 'p-x' })

    const res = await runCancelPOST(new Request('http://localhost/api/agent/runs/run-1/cancel', {
      method: 'POST',
    }), {
      params: { id: 'run-1' },
    })
    assert.equal(res.status, 404)
  } finally {
    sessionProvider.getSession = originalGetSession
    ;(prisma.property as any).findMany = originalPropertyFindMany
    ;(prisma.agentRun as any).findUnique = originalRunFindUnique
  }
})

test('agent exception routes enforce manager property scope', async () => {
  const originalGetSession = sessionProvider.getSession
  const originalPropertyFindMany = (prisma.property as any).findMany
  const originalExceptionsFindMany = (prisma.agentException as any).findMany
  const originalExceptionFindUnique = (prisma.agentException as any).findUnique
  let capturedWhere: any = null

  try {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.property as any).findMany = async () => [{ id: 'p-1' }]
    ;(prisma.agentException as any).findMany = async (args: any) => {
      capturedWhere = args.where
      return []
    }

    const listRes = await exceptionsGET(new Request('http://localhost/api/agent/exceptions'))
    assert.equal(listRes.status, 200)
    assert.deepEqual(capturedWhere, { propertyId: { in: ['p-1'] } })

    ;(prisma.agentException as any).findUnique = async () => ({ id: 'ex-1', status: 'OPEN', propertyId: 'p-x' })

    const patchRes = await exceptionPATCH(new Request('http://localhost/api/agent/exceptions/ex-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'ACK' }),
    }), { params: { id: 'ex-1' } })
    assert.equal(patchRes.status, 404)

    const decisionRes = await exceptionDecisionPOST(new Request('http://localhost/api/agent/exceptions/ex-1/decision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    }), { params: { id: 'ex-1' } })
    assert.equal(decisionRes.status, 404)
  } finally {
    sessionProvider.getSession = originalGetSession
    ;(prisma.property as any).findMany = originalPropertyFindMany
    ;(prisma.agentException as any).findMany = originalExceptionsFindMany
    ;(prisma.agentException as any).findUnique = originalExceptionFindUnique
  }
})

test('GET /api/agent/kpis scopes manager to owned properties', async () => {
  const originalGetSession = sessionProvider.getSession
  const originalPropertyFindMany = (prisma.property as any).findMany
  const originalRunFindMany = (prisma.agentRun as any).findMany
  const originalExceptionFindMany = (prisma.agentException as any).findMany
  const captured: any[] = []

  try {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.property as any).findMany = async () => [{ id: 'p-1' }, { id: 'p-2' }]
    ;(prisma.agentRun as any).findMany = async (args: any) => {
      captured.push(args.where)
      return []
    }
    ;(prisma.agentException as any).findMany = async (args: any) => {
      captured.push(args.where)
      return []
    }

    const res = await kpisGET(new Request('http://localhost/api/agent/kpis?days=7'))
    assert.equal(res.status, 200)
    assert.deepEqual(captured[0].propertyId, { in: ['p-1', 'p-2'] })
    assert.deepEqual(captured[1].propertyId, { in: ['p-1', 'p-2'] })
  } finally {
    sessionProvider.getSession = originalGetSession
    ;(prisma.property as any).findMany = originalPropertyFindMany
    ;(prisma.agentRun as any).findMany = originalRunFindMany
    ;(prisma.agentException as any).findMany = originalExceptionFindMany
  }
})

test('agent stream routes apply manager scope', async () => {
  const originalGetSession = sessionProvider.getSession
  const originalPropertyFindMany = (prisma.property as any).findMany
  const originalRunFindMany = (prisma.agentRun as any).findMany
  const originalRunFindUnique = (prisma.agentRun as any).findUnique
  let listWhere: any = null

  try {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.property as any).findMany = async () => [{ id: 'p-1' }]
    ;(prisma.agentRun as any).findMany = async (args: any) => {
      listWhere = args.where
      return []
    }
    ;(prisma.agentRun as any).findUnique = async () => ({
      id: 'run-1',
      propertyId: 'p-x',
      status: 'RUNNING',
      steps: [],
      actionLogs: [],
      exceptions: [],
    })

    const listRes = await runsStreamGET(new Request('http://localhost/api/agent/runs/stream'))
    assert.equal(listRes.status, 200)
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.deepEqual(listWhere, { propertyId: { in: ['p-1'] } })
    if (listRes.body) {
      const reader = listRes.body.getReader()
      await reader.cancel()
    }

    const detailRes = await runStreamGET(new Request('http://localhost/api/agent/runs/run-1/stream'), {
      params: { id: 'run-1' },
    })
    assert.equal(detailRes.status, 200)
    if (detailRes.body) {
      const reader = detailRes.body.getReader()
      await reader.cancel()
    }
  } finally {
    sessionProvider.getSession = originalGetSession
    ;(prisma.property as any).findMany = originalPropertyFindMany
    ;(prisma.agentRun as any).findMany = originalRunFindMany
    ;(prisma.agentRun as any).findUnique = originalRunFindUnique
  }
})

test('policy routes enforce manager property scope', async () => {
  const originalGetSession = sessionProvider.getSession
  const originalPropertyFindMany = (prisma.property as any).findMany
  const originalPolicyFindMany = (prisma.agentPolicy as any).findMany
  let capturedWhere: any = null

  try {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.property as any).findMany = async () => [{ id: 'p-1' }]
    ;(prisma.agentPolicy as any).findMany = async (args: any) => {
      capturedWhere = args.where
      return []
    }

    const res = await policiesGET(new Request('http://localhost/api/agent/policies'))
    assert.equal(res.status, 200)
    assert.deepEqual(capturedWhere, {
      isActive: true,
      OR: [
        { scopeType: 'global' },
        { scopeType: 'property', scopeId: { in: ['p-1'] } },
      ],
    })
  } finally {
    sessionProvider.getSession = originalGetSession
    ;(prisma.property as any).findMany = originalPropertyFindMany
    ;(prisma.agentPolicy as any).findMany = originalPolicyFindMany
  }
})

test('POST /api/agent/policies/evaluate rejects manager access to unowned property', async () => {
  const originalGetSession = sessionProvider.getSession
  const originalPropertyFindMany = (prisma.property as any).findMany

  try {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.property as any).findMany = async () => [{ id: 'p-1' }]

    const res = await policyEvaluatePOST(new Request('http://localhost/api/agent/policies/evaluate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actionType: 'MESSAGE_SEND',
        propertyId: 'p-999',
        context: { intent: 'FAQ', hasLegalKeywords: false },
      }),
    }))
    assert.equal(res.status, 403)
  } finally {
    sessionProvider.getSession = originalGetSession
    ;(prisma.property as any).findMany = originalPropertyFindMany
  }
})

test('POST /api/agent/run requires MANAGER role', async () => {
  const originalGetSession = sessionProvider.getSession
  try {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    const res = await runAgentPOST(new Request('http://localhost/api/agent/run', { method: 'POST' }))
    assert.equal(res.status, 401)
  } finally {
    sessionProvider.getSession = originalGetSession
  }
})

test('PATCH /api/agent/settings validates autoExecuteTypes and tone', async () => {
  const originalGetSession = sessionProvider.getSession
  try {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    const invalidTypeRes = await settingsPATCH(new Request('http://localhost/api/agent/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ autoExecuteTypes: ['DROP_DATABASE'] }),
    }))
    assert.equal(invalidTypeRes.status, 400)

    const invalidToneRes = await settingsPATCH(new Request('http://localhost/api/agent/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tone: 'aggressive' }),
    }))
    assert.equal(invalidToneRes.status, 400)
  } finally {
    sessionProvider.getSession = originalGetSession
  }
})
