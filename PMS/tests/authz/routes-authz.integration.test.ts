import test from 'node:test'
import assert from 'node:assert/strict'
import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { sessionProvider } from '@/lib/session-provider'
import { GET as documentsGET, POST as documentsPOST } from '@/app/api/documents/route'
import { documentQueries } from '@/lib/documents-data'
import { DELETE as documentDELETE } from '@/app/api/documents/[id]/route'
import { GET as workOrderGET, PATCH as workOrderPATCH } from '@/app/api/workorders/[id]/route'
import { GET as messageThreadGET, PATCH as messageThreadPATCH } from '@/app/api/messages/threads/[id]/route'

function makeSession(role: 'ADMIN' | 'MANAGER' | 'TENANT', id: string): Session {
  return {
    user: { id, systemRole: role, name: null, email: null, image: null, orgId: null },
    expires: '2099-01-01T00:00:00.000Z',
  }
}

test('GET /api/documents enforces tenant and manager property scoping', async () => {
  const originalGetSession = sessionProvider.getSession
  const originalFindMany = documentQueries.findMany
  const capturedWhere: any[] = []

  try {
    documentQueries.findMany = async (args: any) => {
      capturedWhere.push(args.where)
      return []
    }

    sessionProvider.getSession = async () => makeSession('TENANT', 'tenant-user')
    const tenantRes = await documentsGET(new Request('http://localhost/api/documents?propertyId=prop-1'))
    assert.equal(tenantRes.status, 200)
    assert.deepEqual(capturedWhere[0], {
      workOrder: { submittedById: 'tenant-user' },
      propertyId: 'prop-1',
    })

    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    const managerRes = await documentsGET(
      new Request('http://localhost/api/documents?propertyId=prop-1&scopeType=workorder')
    )
    assert.equal(managerRes.status, 200)
    assert.deepEqual(capturedWhere[1], {
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
    documentQueries.findMany = originalFindMany
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

test('POST /api/documents rejects disallowed file types', async () => {
  const originalGetSession = sessionProvider.getSession
  try {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    const form = new FormData()
    form.set('file', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'payload.html')
    form.set('scopeType', 'workorder')
    form.set('scopeId', 'wo-1')
    form.set('propertyId', 'prop-1')

    const res = await documentsPOST(
      new Request('http://localhost/api/documents', {
        method: 'POST',
        body: form,
      })
    )
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error, 'file extension not allowed')
  } finally {
    sessionProvider.getSession = originalGetSession
  }
})

test('POST /api/documents rejects manager upload for unmanaged work order', async () => {
  const originalGetSession = sessionProvider.getSession
  const originalWorkOrderFindFirst = (prisma.workOrder as any).findFirst
  try {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.workOrder as any).findFirst = async () => null

    const form = new FormData()
    form.set('file', new Blob(['x'], { type: 'application/pdf' }), 'file.pdf')
    form.set('scopeType', 'workorder')
    form.set('scopeId', 'wo-x')
    form.set('workOrderId', 'wo-x')

    const res = await documentsPOST(
      new Request('http://localhost/api/documents', {
        method: 'POST',
        body: form,
      })
    )
    assert.equal(res.status, 404)
  } finally {
    sessionProvider.getSession = originalGetSession
    ;(prisma.workOrder as any).findFirst = originalWorkOrderFindFirst
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
