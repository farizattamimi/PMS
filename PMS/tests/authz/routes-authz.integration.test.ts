import test from 'node:test'
import assert from 'node:assert/strict'
import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { sessionProvider } from '@/lib/session-provider'
import { GET as documentsGET } from '@/app/api/documents/route'
import { DELETE as documentDELETE } from '@/app/api/documents/[id]/route'
import { GET as workOrderGET, PATCH as workOrderPATCH } from '@/app/api/workorders/[id]/route'
import { GET as messageThreadGET, PATCH as messageThreadPATCH } from '@/app/api/messages/threads/[id]/route'

function makeSession(role: 'ADMIN' | 'MANAGER' | 'TENANT', id: string): Session {
  return {
    user: { id, systemRole: role, name: null, email: null, image: null },
    expires: '2099-01-01T00:00:00.000Z',
  }
}

test('GET /api/documents enforces tenant deny and manager property scoping', async () => {
  const originalGetSession = sessionProvider.getSession
  const originalFindMany = (prisma.document as any).findMany
  let capturedWhere: any = null

  try {
    sessionProvider.getSession = async () => makeSession('TENANT', 'tenant-user')
    const tenantRes = await documentsGET(new Request('http://localhost/api/documents?propertyId=prop-1'))
    assert.equal(tenantRes.status, 401)

    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.document as any).findMany = async (args: any) => {
      capturedWhere = args.where
      return []
    }
    const managerRes = await documentsGET(
      new Request('http://localhost/api/documents?propertyId=prop-1&scopeType=workorder')
    )
    assert.equal(managerRes.status, 200)
    assert.deepEqual(capturedWhere, {
      OR: [
        { property: { managerId: 'mgr-1' } },
        { workOrder: { property: { managerId: 'mgr-1' } } },
        { uploadedById: 'mgr-1' },
      ],
      propertyId: 'prop-1',
      scopeType: 'workorder',
    })
  } finally {
    sessionProvider.getSession = originalGetSession
    ;(prisma.document as any).findMany = originalFindMany
  }
})

test('GET /api/workorders/[id] applies manager scope in prisma query', async () => {
  const originalGetSession = sessionProvider.getSession
  const originalFindFirst = (prisma.workOrder as any).findFirst
  let capturedWhere: any = null

  try {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-2')
    ;(prisma.workOrder as any).findFirst = async (args: any) => {
      capturedWhere = args.where
      return {
        id: 'wo-1',
        submittedById: 'user-1',
        property: { id: 'prop-9', name: 'P9' },
        unit: null,
        submittedBy: { id: 'user-1', name: 'U1', email: 'u1@example.com' },
        assignedVendor: null,
        costs: [],
        review: null,
      }
    }

    const res = await workOrderGET(new Request('http://localhost/api/workorders/wo-1'), {
      params: { id: 'wo-1' },
    })
    assert.equal(res.status, 200)
    assert.deepEqual(capturedWhere, {
      id: 'wo-1',
      property: { managerId: 'mgr-2' },
    })
  } finally {
    sessionProvider.getSession = originalGetSession
    ;(prisma.workOrder as any).findFirst = originalFindFirst
  }
})

test('GET /api/messages/threads/[id] enforces tenant thread scope and marks read', async () => {
  const originalGetSession = sessionProvider.getSession
  const originalTenantFindUnique = (prisma.tenant as any).findUnique
  const originalThreadFindFirst = (prisma.messageThread as any).findFirst
  const originalMessageUpdateMany = (prisma.message as any).updateMany
  let capturedThreadWhere: any = null
  let capturedUpdateWhere: any = null

  try {
    sessionProvider.getSession = async () => makeSession('TENANT', 'tenant-user-9')
    ;(prisma.tenant as any).findUnique = async () => ({ id: 'tenant-9' })
    ;(prisma.messageThread as any).findFirst = async (args: any) => {
      capturedThreadWhere = args.where
      return {
        id: 'thread-1',
        tenantId: 'tenant-9',
        property: { id: 'prop-1', name: 'P1', managerId: 'mgr-1' },
        tenant: { user: { id: 'tenant-user-9', name: 'T', email: 't@example.com' } },
        messages: [{ id: 'm1', authorId: 'mgr-1', body: 'hi', createdAt: new Date().toISOString() }],
      }
    }
    ;(prisma.message as any).updateMany = async (args: any) => {
      capturedUpdateWhere = args.where
      return { count: 1 }
    }

    const res = await messageThreadGET(new Request('http://localhost/api/messages/threads/thread-1'), {
      params: { id: 'thread-1' },
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.id, 'thread-1')
    assert.deepEqual(capturedThreadWhere, { id: 'thread-1', tenantId: 'tenant-9' })
    assert.deepEqual(capturedUpdateWhere, {
      threadId: 'thread-1',
      authorId: { not: 'tenant-user-9' },
      readAt: null,
    })
  } finally {
    sessionProvider.getSession = originalGetSession
    ;(prisma.tenant as any).findUnique = originalTenantFindUnique
    ;(prisma.messageThread as any).findFirst = originalThreadFindFirst
    ;(prisma.message as any).updateMany = originalMessageUpdateMany
  }
})

test('DELETE /api/documents/[id] enforces manager authorization and allows own uploads', async () => {
  const originalGetSession = sessionProvider.getSession
  const originalFindUnique = (prisma.document as any).findUnique
  const originalDelete = (prisma.document as any).delete
  const originalAuditCreate = (prisma.auditLog as any).create

  try {
    sessionProvider.getSession = async () => makeSession('TENANT', 'tenant-1')
    ;(prisma.document as any).findUnique = async () => ({
      id: 'doc-1',
      fileUrl: '/uploads/documents/a.pdf',
      fileName: 'a.pdf',
      uploadedById: 'mgr-1',
      property: { managerId: 'mgr-1' },
      workOrder: null,
    })
    let res = await documentDELETE(new Request('http://localhost/api/documents/doc-1'), {
      params: { id: 'doc-1' },
    })
    assert.equal(res.status, 401)

    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-2')
    res = await documentDELETE(new Request('http://localhost/api/documents/doc-1'), {
      params: { id: 'doc-1' },
    })
    assert.equal(res.status, 404)

    let deletedId: string | null = null
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-2')
    ;(prisma.document as any).findUnique = async () => ({
      id: 'doc-2',
      fileUrl: '/uploads/documents/b.pdf',
      fileName: 'b.pdf',
      uploadedById: 'mgr-2',
      property: null,
      workOrder: null,
    })
    ;(prisma.document as any).delete = async (args: any) => {
      deletedId = args.where.id
      return { id: args.where.id }
    }
    ;(prisma.auditLog as any).create = async () => ({ id: 'audit-1' })
    res = await documentDELETE(new Request('http://localhost/api/documents/doc-2'), {
      params: { id: 'doc-2' },
    })
    assert.equal(res.status, 200)
    assert.equal(deletedId, 'doc-2')
  } finally {
    sessionProvider.getSession = originalGetSession
    ;(prisma.document as any).findUnique = originalFindUnique
    ;(prisma.document as any).delete = originalDelete
    ;(prisma.auditLog as any).create = originalAuditCreate
  }
})

test('PATCH /api/workorders/[id] enforces role/scope and transition validation', async () => {
  const originalGetSession = sessionProvider.getSession
  const originalFindFirst = (prisma.workOrder as any).findFirst
  const originalUpdate = (prisma.workOrder as any).update
  const originalAuditCreate = (prisma.auditLog as any).create

  try {
    sessionProvider.getSession = async () => makeSession('TENANT', 'tenant-1')
    let res = await workOrderPATCH(
      new Request('http://localhost/api/workorders/wo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'ASSIGNED' }),
      }),
      { params: { id: 'wo-1' } }
    )
    assert.equal(res.status, 401)

    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.workOrder as any).findFirst = async () => null
    res = await workOrderPATCH(
      new Request('http://localhost/api/workorders/wo-x', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'ASSIGNED' }),
      }),
      { params: { id: 'wo-x' } }
    )
    assert.equal(res.status, 404)

    ;(prisma.workOrder as any).findFirst = async () => ({
      id: 'wo-1',
      title: 'Leak',
      status: 'NEW',
      submittedById: 'tenant-1',
    })
    res = await workOrderPATCH(
      new Request('http://localhost/api/workorders/wo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      }),
      { params: { id: 'wo-1' } }
    )
    assert.equal(res.status, 400)

    let updatedData: any = null
    ;(prisma.workOrder as any).update = async (args: any) => {
      updatedData = args.data
      return { id: 'wo-1', property: { name: 'P1' }, assignedVendor: null }
    }
    ;(prisma.auditLog as any).create = async () => ({ id: 'audit-2' })
    res = await workOrderPATCH(
      new Request('http://localhost/api/workorders/wo-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Updated leak title' }),
      }),
      { params: { id: 'wo-1' } }
    )
    assert.equal(res.status, 200)
    assert.equal(updatedData.title, 'Updated leak title')
  } finally {
    sessionProvider.getSession = originalGetSession
    ;(prisma.workOrder as any).findFirst = originalFindFirst
    ;(prisma.workOrder as any).update = originalUpdate
    ;(prisma.auditLog as any).create = originalAuditCreate
  }
})

test('PATCH /api/messages/threads/[id] enforces role and manager scope', async () => {
  const originalGetSession = sessionProvider.getSession
  const originalFindFirst = (prisma.messageThread as any).findFirst
  const originalUpdate = (prisma.messageThread as any).update

  try {
    sessionProvider.getSession = async () => makeSession('TENANT', 'tenant-1')
    let res = await messageThreadPATCH(
      new Request('http://localhost/api/messages/threads/thread-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'CLOSED' }),
      }),
      { params: { id: 'thread-1' } }
    )
    assert.equal(res.status, 401)

    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.messageThread as any).findFirst = async () => null
    res = await messageThreadPATCH(
      new Request('http://localhost/api/messages/threads/thread-x', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'CLOSED' }),
      }),
      { params: { id: 'thread-x' } }
    )
    assert.equal(res.status, 404)

    ;(prisma.messageThread as any).findFirst = async () => ({ id: 'thread-1' })
    ;(prisma.messageThread as any).update = async () => ({ id: 'thread-1', status: 'CLOSED' })
    res = await messageThreadPATCH(
      new Request('http://localhost/api/messages/threads/thread-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'CLOSED' }),
      }),
      { params: { id: 'thread-1' } }
    )
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.status, 'CLOSED')
  } finally {
    sessionProvider.getSession = originalGetSession
    ;(prisma.messageThread as any).findFirst = originalFindFirst
    ;(prisma.messageThread as any).update = originalUpdate
  }
})
