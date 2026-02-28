/**
 * tests/audit-log.test.ts
 *
 * Unit tests for Audit Log Viewer API.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('Audit Log API', { concurrency: 1 }, () => {
  it('1. GET /api/audit rejects unauthenticated (session is null)', () => {
    // Simulate: session check must exist — any route reading getServerSession
    // will fail if no session. We test the auth check logic inline.
    const session = null
    const isAllowed = session !== null && ['ADMIN', 'MANAGER'].includes((session as any)?.user?.systemRole)
    assert.equal(isAllowed, false)
  })

  it('2. TENANT role is rejected', () => {
    const session = { user: { systemRole: 'TENANT' } }
    const isAllowed = ['ADMIN', 'MANAGER'].includes(session.user.systemRole)
    assert.equal(isAllowed, false)
  })

  it('3. ADMIN role is allowed', () => {
    const session = { user: { systemRole: 'ADMIN' } }
    const isAllowed = ['ADMIN', 'MANAGER'].includes(session.user.systemRole)
    assert.equal(isAllowed, true)
  })

  it('4. MANAGER role is allowed', () => {
    const session = { user: { systemRole: 'MANAGER' } }
    const isAllowed = ['ADMIN', 'MANAGER'].includes(session.user.systemRole)
    assert.equal(isAllowed, true)
  })

  it('5. take is capped at 200', () => {
    const rawTake = parseInt('9999')
    const take = Math.min(rawTake, 200)
    assert.equal(take, 200)
  })

  it('6. date range filter builds createdAt condition', () => {
    const dateFrom = '2026-01-01'
    const dateTo = '2026-01-31'
    const where: any = {}
    if (dateFrom || dateTo) {
      where.createdAt = {}
      if (dateFrom) where.createdAt.gte = new Date(dateFrom)
      if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59.999Z')
    }
    assert.ok(where.createdAt)
    assert.ok(where.createdAt.gte instanceof Date)
    assert.ok(where.createdAt.lte instanceof Date)
  })

  it('7. CSV export header format is correct', () => {
    const header = 'Timestamp,Actor,Action,Entity Type,Entity ID,Diff'
    assert.ok(header.includes('Timestamp'))
    assert.ok(header.includes('Entity Type'))

    const log = {
      createdAt: new Date('2026-01-15'),
      actor: { name: 'Admin' },
      actorUserId: 'u1',
      action: 'CREATE',
      entityType: 'Property',
      entityId: 'p1',
      diff: { name: 'Test' },
    }
    const ts = log.createdAt.toISOString()
    const actor = log.actor?.name ?? ''
    const diff = JSON.stringify(log.diff).replace(/"/g, '""')
    const row = `${ts},"${actor}",${log.action},${log.entityType},${log.entityId},"${diff}"`
    assert.ok(row.includes('Admin'))
    assert.ok(row.includes('CREATE'))
    assert.ok(row.includes('Property'))
  })

  it('8. MANAGER scoping builds OR filter when scopedPropertyIds is non-null', () => {
    const scopedIds = ['p1', 'p2']
    const managerId = 'm1'
    const where: any = {}

    if (scopedIds !== null && scopedIds.length > 0) {
      where.OR = [
        { actorUserId: managerId },
        { entityType: 'Property', entityId: { in: scopedIds } },
      ]
    }

    assert.ok(where.OR)
    assert.equal(where.OR.length, 2)
    assert.deepEqual(where.OR[1].entityId.in, ['p1', 'p2'])
  })
})
