import test from 'node:test'
import assert from 'node:assert/strict'
import type { Session } from 'next-auth'
import {
  propertyScopeWhere,
  workOrderScopeWhere,
  documentScopeWhere,
  messageThreadScopeWhere,
} from '@/lib/access'
import { prisma } from '@/lib/prisma'

function makeSession(role: 'ADMIN' | 'MANAGER' | 'TENANT', id: string): Session {
  return {
    user: { id, systemRole: role, name: null, email: null, image: null, orgId: null },
    expires: '2099-01-01T00:00:00.000Z',
  }
}

test('property scope where clauses are role-scoped', () => {
  assert.deepEqual(propertyScopeWhere(makeSession('ADMIN', 'admin-1')), {})
  assert.deepEqual(propertyScopeWhere(makeSession('MANAGER', 'mgr-1')), { managerId: 'mgr-1' })
  assert.deepEqual(propertyScopeWhere(makeSession('TENANT', 'ten-1')), { id: '__forbidden__' })
})

test('work order scope where clauses are role-scoped', () => {
  assert.deepEqual(workOrderScopeWhere(makeSession('ADMIN', 'admin-1')), {})
  assert.deepEqual(workOrderScopeWhere(makeSession('MANAGER', 'mgr-1')), {
    property: { managerId: 'mgr-1' },
  })
  assert.deepEqual(workOrderScopeWhere(makeSession('TENANT', 'ten-1')), { submittedById: 'ten-1' })
})

test('document scope where clauses are role-scoped', () => {
  assert.deepEqual(documentScopeWhere(makeSession('ADMIN', 'admin-1')), {})
  assert.equal(documentScopeWhere(makeSession('TENANT', 'ten-1')), null)
  assert.deepEqual(documentScopeWhere(makeSession('MANAGER', 'mgr-1')), {
    OR: [
      { property: { managerId: 'mgr-1' } },
      { workOrder: { property: { managerId: 'mgr-1' } } },
      { uploadedById: 'mgr-1' },
    ],
  })
})

test('message thread scope resolves tenant ownership via tenant record', async () => {
  const originalFindUnique = (prisma.tenant as any).findUnique

  try {
    ;(prisma.tenant as any).findUnique = async () => ({ id: 'tenant-123' })
    assert.deepEqual(await messageThreadScopeWhere(makeSession('TENANT', 'user-1')), {
      tenantId: 'tenant-123',
    })

    ;(prisma.tenant as any).findUnique = async () => null
    assert.equal(await messageThreadScopeWhere(makeSession('TENANT', 'user-1')), null)

    assert.deepEqual(await messageThreadScopeWhere(makeSession('MANAGER', 'mgr-1')), {
      property: { managerId: 'mgr-1' },
    })
    assert.deepEqual(await messageThreadScopeWhere(makeSession('ADMIN', 'admin-1')), {})
  } finally {
    ;(prisma.tenant as any).findUnique = originalFindUnique
  }
})
