import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { sessionProvider } from '@/lib/session-provider'

// Route handlers
import { GET as slaGET } from '@/app/api/portal/sla/route'
import { POST as bulkRenewalPOST } from '@/app/api/leases/bulk-renewal/route'
import { GET as onboardingListGET, POST as onboardingPOST } from '@/app/api/onboarding/route'
import { GET as onboardingDetailGET, PATCH as onboardingPATCH } from '@/app/api/onboarding/[id]/route'
import { POST as taskCompletePOST } from '@/app/api/onboarding/[id]/tasks/[taskId]/complete/route'
import { GET as ownerPortfolioGET } from '@/app/api/owner/portfolio/route'
import { GET as ownerPropertyGET } from '@/app/api/owner/properties/[id]/route'
import { GET as ownerDistributionsGET } from '@/app/api/owner/distributions/route'
import { GET as distributionsListGET, POST as distributionsPOST } from '@/app/api/distributions/route'
import { PATCH as distributionPATCH } from '@/app/api/distributions/[id]/route'
import { GET as orgSettingsGET, PATCH as orgSettingsPATCH } from '@/app/api/org/settings/route'

// Helpers
import { computeProgress, DEFAULT_TASKS } from '@/lib/onboarding'
import { orgScopeWhere, isOwner } from '@/lib/access'
import { hasPermission } from '@/lib/permissions'
import { SystemRole, Permission } from '@prisma/client'

function makeSession(role: string, id: string, orgId: string | null = null): Session {
  return {
    user: { id, systemRole: role as any, name: 'Test User', email: 'test@test.com', image: null, orgId },
    expires: '2099-01-01T00:00:00.000Z',
  }
}

function makeReq(url: string, opts?: RequestInit): Request {
  return new Request(`http://localhost${url}`, opts)
}

function jsonReq(url: string, body: any): Request {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function patchReq(url: string, body: any): Request {
  return new Request(`http://localhost${url}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature 4: Maintenance SLA Dashboard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/portal/sla', { concurrency: 1 }, () => {
  const origGetSession = sessionProvider.getSession
  const origFindMany = (prisma.workOrder as any).findMany

  afterEach(() => {
    sessionProvider.getSession = origGetSession
    ;(prisma.workOrder as any).findMany = origFindMany
  })

  test('denies unauthenticated requests', async () => {
    sessionProvider.getSession = async () => null
    const res = await slaGET()
    assert.equal(res.status, 401)
  })

  test('denies ADMIN role', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    const res = await slaGET()
    assert.equal(res.status, 401)
  })

  test('denies MANAGER role', async () => {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    const res = await slaGET()
    assert.equal(res.status, 401)
  })

  test('denies VENDOR role', async () => {
    sessionProvider.getSession = async () => makeSession('VENDOR', 'vendor-1')
    const res = await slaGET()
    assert.equal(res.status, 401)
  })

  test('denies OWNER role', async () => {
    sessionProvider.getSession = async () => makeSession('OWNER', 'owner-1')
    const res = await slaGET()
    assert.equal(res.status, 401)
  })

  test('allows TENANT and scopes to submittedById', async () => {
    let capturedWhere: any = null
    sessionProvider.getSession = async () => makeSession('TENANT', 'tenant-1')
    ;(prisma.workOrder as any).findMany = async (args: any) => {
      capturedWhere = args.where
      return []
    }
    const res = await slaGET()
    assert.equal(res.status, 200)
    assert.deepEqual(capturedWhere, { submittedById: 'tenant-1' })
  })

  test('correctly categorizes active vs completed work orders', async () => {
    const now = new Date()
    const futureDate = new Date(now.getTime() + 48 * 60 * 60 * 1000) // 48h from now
    const pastDate = new Date(now.getTime() - 4 * 60 * 60 * 1000) // 4h ago

    sessionProvider.getSession = async () => makeSession('TENANT', 'tenant-1')
    ;(prisma.workOrder as any).findMany = async () => [
      {
        id: 'wo-1', title: 'Active WO', status: 'IN_PROGRESS', category: 'GENERAL',
        priority: 'MEDIUM', slaDate: futureDate, completedAt: null, createdAt: pastDate,
        property: { id: 'p1', name: 'Prop 1' }, unit: null, assignedVendor: null,
      },
      {
        id: 'wo-2', title: 'Completed WO', status: 'COMPLETED', category: 'PLUMBING',
        priority: 'HIGH', slaDate: futureDate, completedAt: now, createdAt: pastDate,
        property: { id: 'p1', name: 'Prop 1' }, unit: null, assignedVendor: null,
      },
    ]
    const res = await slaGET()
    const data = await res.json()
    assert.equal(data.active.length, 1)
    assert.equal(data.completed.length, 1)
    assert.equal(data.stats.totalActive, 1)
    assert.equal(data.stats.onTimePct, 100) // completed before sla
  })

  test('detects breached SLA correctly', async () => {
    const now = new Date()
    const pastSla = new Date(now.getTime() - 2 * 60 * 60 * 1000) // 2h ago

    sessionProvider.getSession = async () => makeSession('TENANT', 'tenant-1')
    ;(prisma.workOrder as any).findMany = async () => [
      {
        id: 'wo-breach', title: 'Breached', status: 'NEW', category: 'GENERAL',
        priority: 'HIGH', slaDate: pastSla, completedAt: null, createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        property: null, unit: null, assignedVendor: null,
      },
    ]
    const res = await slaGET()
    const data = await res.json()
    assert.equal(data.active[0].breached, true)
    assert.equal(data.active[0].urgency, 'red')
    assert.equal(data.stats.breachedCount, 1)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature 3: Bulk Lease Renewals
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/leases/bulk-renewal', { concurrency: 1 }, () => {
  const origGetSession = sessionProvider.getSession
  const origLeaseFindMany = (prisma.lease as any).findMany
  const origOfferCreate = (prisma.leaseRenewalOffer as any).create
  const origAuditCreate = (prisma.auditLog as any).create

  afterEach(() => {
    sessionProvider.getSession = origGetSession
    ;(prisma.lease as any).findMany = origLeaseFindMany
    ;(prisma.leaseRenewalOffer as any).create = origOfferCreate
    ;(prisma.auditLog as any).create = origAuditCreate
  })

  test('denies unauthenticated requests', async () => {
    sessionProvider.getSession = async () => null
    const res = await bulkRenewalPOST(jsonReq('/api/leases/bulk-renewal', { leaseIds: ['l1'] }))
    assert.equal(res.status, 401)
  })

  test('denies TENANT role', async () => {
    sessionProvider.getSession = async () => makeSession('TENANT', 'tenant-1')
    const res = await bulkRenewalPOST(jsonReq('/api/leases/bulk-renewal', {
      leaseIds: ['l1'], rentAdjustmentType: 'pct', rentAdjustmentValue: 3, termMonths: 12, expiryDays: 14,
    }))
    assert.equal(res.status, 401)
  })

  test('denies VENDOR role', async () => {
    sessionProvider.getSession = async () => makeSession('VENDOR', 'v1')
    const res = await bulkRenewalPOST(jsonReq('/api/leases/bulk-renewal', {
      leaseIds: ['l1'], rentAdjustmentType: 'pct', rentAdjustmentValue: 3, termMonths: 12, expiryDays: 14,
    }))
    assert.equal(res.status, 401)
  })

  test('denies OWNER role', async () => {
    sessionProvider.getSession = async () => makeSession('OWNER', 'o1')
    const res = await bulkRenewalPOST(jsonReq('/api/leases/bulk-renewal', {
      leaseIds: ['l1'], rentAdjustmentType: 'pct', rentAdjustmentValue: 3, termMonths: 12, expiryDays: 14,
    }))
    assert.equal(res.status, 401)
  })

  test('rejects missing required fields', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    const res = await bulkRenewalPOST(jsonReq('/api/leases/bulk-renewal', { leaseIds: ['l1'] }))
    assert.equal(res.status, 400)
  })

  test('rejects empty leaseIds array', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    const res = await bulkRenewalPOST(jsonReq('/api/leases/bulk-renewal', {
      leaseIds: [], rentAdjustmentType: 'pct', rentAdjustmentValue: 3, termMonths: 12, expiryDays: 14,
    }))
    assert.equal(res.status, 400)
  })

  test('MANAGER cannot renew leases on properties they do not manage', async () => {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.lease as any).findMany = async () => [
      {
        id: 'l1', status: 'ACTIVE', monthlyRent: 1000,
        property: { id: 'p1', name: 'Test', managerId: 'mgr-other' },
        tenant: { user: { id: 'u1', name: 'Tenant' } },
        unit: { unitNumber: '101' },
        renewalOffers: [],
      },
    ]
    const res = await bulkRenewalPOST(jsonReq('/api/leases/bulk-renewal', {
      leaseIds: ['l1'], rentAdjustmentType: 'pct', rentAdjustmentValue: 3, termMonths: 12, expiryDays: 14,
    }))
    const data = await res.json()
    assert.equal(data.sent, 0)
    assert.equal(data.skipped, 1)
    assert.equal(data.errors[0].reason, 'Not your property')
  })

  test('skips non-active leases', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.lease as any).findMany = async () => [
      {
        id: 'l1', status: 'ENDED', monthlyRent: 1000,
        property: { id: 'p1', name: 'Test', managerId: 'admin-1' },
        tenant: { user: { id: 'u1', name: 'Tenant' } },
        unit: { unitNumber: '101' },
        renewalOffers: [],
      },
    ]
    const res = await bulkRenewalPOST(jsonReq('/api/leases/bulk-renewal', {
      leaseIds: ['l1'], rentAdjustmentType: 'pct', rentAdjustmentValue: 3, termMonths: 12, expiryDays: 14,
    }))
    const data = await res.json()
    assert.equal(data.sent, 0)
    assert.equal(data.errors[0].reason, 'Lease not active')
  })

  test('skips leases that already have a pending offer', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.lease as any).findMany = async () => [
      {
        id: 'l1', status: 'ACTIVE', monthlyRent: 1000,
        property: { id: 'p1', name: 'Test', managerId: 'admin-1' },
        tenant: { user: { id: 'u1', name: 'Tenant' } },
        unit: { unitNumber: '101' },
        renewalOffers: [{ id: 'offer-1' }], // pending offer exists
      },
    ]
    const res = await bulkRenewalPOST(jsonReq('/api/leases/bulk-renewal', {
      leaseIds: ['l1'], rentAdjustmentType: 'pct', rentAdjustmentValue: 3, termMonths: 12, expiryDays: 14,
    }))
    const data = await res.json()
    assert.equal(data.sent, 0)
    assert.equal(data.errors[0].reason, 'Already has pending offer')
  })

  test('handles non-existent leaseIds gracefully', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.lease as any).findMany = async () => [] // none found
    const res = await bulkRenewalPOST(jsonReq('/api/leases/bulk-renewal', {
      leaseIds: ['fake-id'], rentAdjustmentType: 'pct', rentAdjustmentValue: 5, termMonths: 12, expiryDays: 14,
    }))
    const data = await res.json()
    assert.equal(data.sent, 0)
    assert.equal(data.skipped, 1)
    assert.equal(data.errors[0].reason, 'Lease not found')
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature 1: Tenant Onboarding
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Onboarding unit helpers', { concurrency: 1 }, () => {
  test('DEFAULT_TASKS has 7 items', () => {
    assert.equal(DEFAULT_TASKS.length, 7)
  })

  test('computeProgress with no tasks returns 0/0', () => {
    const result = computeProgress([])
    assert.equal(result.total, 0)
    assert.equal(result.completed, 0)
    assert.equal(result.pct, 0)
    assert.equal(result.allRequiredDone, true) // vacuously true
  })

  test('computeProgress correctly counts completed required tasks', () => {
    const tasks = [
      { completedAt: new Date(), isRequired: true },
      { completedAt: null, isRequired: true },
      { completedAt: new Date(), isRequired: false },
    ]
    const result = computeProgress(tasks)
    assert.equal(result.total, 3)
    assert.equal(result.completed, 2)
    assert.equal(result.requiredTotal, 2)
    assert.equal(result.requiredCompleted, 1)
    assert.equal(result.allRequiredDone, false)
    assert.equal(result.pct, 67)
  })

  test('computeProgress allRequiredDone when all required completed', () => {
    const tasks = [
      { completedAt: new Date(), isRequired: true },
      { completedAt: new Date(), isRequired: true },
      { completedAt: null, isRequired: false },
    ]
    const result = computeProgress(tasks)
    assert.equal(result.allRequiredDone, true)
  })
})

describe('GET /api/onboarding', { concurrency: 1 }, () => {
  const origGetSession = sessionProvider.getSession

  afterEach(() => {
    sessionProvider.getSession = origGetSession
  })

  test('denies unauthenticated requests', async () => {
    sessionProvider.getSession = async () => null
    const res = await onboardingListGET()
    assert.equal(res.status, 401)
  })

  test('denies VENDOR role', async () => {
    sessionProvider.getSession = async () => makeSession('VENDOR', 'v1')
    const res = await onboardingListGET()
    assert.equal(res.status, 401)
  })

  test('denies OWNER role', async () => {
    sessionProvider.getSession = async () => makeSession('OWNER', 'o1')
    const res = await onboardingListGET()
    assert.equal(res.status, 401)
  })
})

describe('POST /api/onboarding', { concurrency: 1 }, () => {
  const origGetSession = sessionProvider.getSession

  afterEach(() => {
    sessionProvider.getSession = origGetSession
  })

  test('denies TENANT from creating checklists', async () => {
    sessionProvider.getSession = async () => makeSession('TENANT', 'tenant-1')
    const res = await onboardingPOST(jsonReq('/api/onboarding', { leaseId: 'l1' }))
    assert.equal(res.status, 401)
  })

  test('denies VENDOR from creating checklists', async () => {
    sessionProvider.getSession = async () => makeSession('VENDOR', 'v1')
    const res = await onboardingPOST(jsonReq('/api/onboarding', { leaseId: 'l1' }))
    assert.equal(res.status, 401)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature 2: Owner/Investor Portal
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/owner/portfolio', { concurrency: 1 }, () => {
  const origGetSession = sessionProvider.getSession

  afterEach(() => {
    sessionProvider.getSession = origGetSession
  })

  test('denies unauthenticated requests', async () => {
    sessionProvider.getSession = async () => null
    const res = await ownerPortfolioGET()
    assert.equal(res.status, 401)
  })

  test('denies TENANT role', async () => {
    sessionProvider.getSession = async () => makeSession('TENANT', 't1')
    const res = await ownerPortfolioGET()
    assert.equal(res.status, 401)
  })

  test('denies MANAGER role', async () => {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'm1')
    const res = await ownerPortfolioGET()
    assert.equal(res.status, 401)
  })

  test('denies ADMIN role', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'a1')
    const res = await ownerPortfolioGET()
    assert.equal(res.status, 401)
  })

  test('denies VENDOR role', async () => {
    sessionProvider.getSession = async () => makeSession('VENDOR', 'v1')
    const res = await ownerPortfolioGET()
    assert.equal(res.status, 401)
  })
})

describe('GET /api/owner/properties/[id]', { concurrency: 1 }, () => {
  const origGetSession = sessionProvider.getSession

  afterEach(() => {
    sessionProvider.getSession = origGetSession
  })

  test('denies non-OWNER roles', async () => {
    for (const role of ['ADMIN', 'MANAGER', 'TENANT', 'VENDOR']) {
      sessionProvider.getSession = async () => makeSession(role, 'user-1')
      const res = await ownerPropertyGET(makeReq('/api/owner/properties/p1'), { params: { id: 'p1' } })
      assert.equal(res.status, 401, `Expected 401 for role ${role}`)
    }
  })
})

describe('GET /api/owner/distributions', { concurrency: 1 }, () => {
  const origGetSession = sessionProvider.getSession

  afterEach(() => {
    sessionProvider.getSession = origGetSession
  })

  test('denies non-OWNER roles', async () => {
    for (const role of ['ADMIN', 'MANAGER', 'TENANT', 'VENDOR']) {
      sessionProvider.getSession = async () => makeSession(role, 'user-1')
      const res = await ownerDistributionsGET()
      assert.equal(res.status, 401, `Expected 401 for role ${role}`)
    }
  })
})

describe('GET /api/distributions (manager)', { concurrency: 1 }, () => {
  const origGetSession = sessionProvider.getSession

  afterEach(() => {
    sessionProvider.getSession = origGetSession
  })

  test('denies TENANT role', async () => {
    sessionProvider.getSession = async () => makeSession('TENANT', 't1')
    const res = await distributionsListGET(makeReq('/api/distributions'))
    assert.equal(res.status, 401)
  })

  test('denies VENDOR role', async () => {
    sessionProvider.getSession = async () => makeSession('VENDOR', 'v1')
    const res = await distributionsListGET(makeReq('/api/distributions'))
    assert.equal(res.status, 401)
  })

  test('denies OWNER role', async () => {
    sessionProvider.getSession = async () => makeSession('OWNER', 'o1')
    const res = await distributionsListGET(makeReq('/api/distributions'))
    assert.equal(res.status, 401)
  })
})

describe('POST /api/distributions', { concurrency: 1 }, () => {
  const origGetSession = sessionProvider.getSession

  afterEach(() => {
    sessionProvider.getSession = origGetSession
  })

  test('denies TENANT role', async () => {
    sessionProvider.getSession = async () => makeSession('TENANT', 't1')
    const res = await distributionsPOST(jsonReq('/api/distributions', { propertyId: 'p1', period: '2026-02', managementFeePct: 8 }))
    assert.equal(res.status, 401)
  })

  test('denies OWNER role', async () => {
    sessionProvider.getSession = async () => makeSession('OWNER', 'o1')
    const res = await distributionsPOST(jsonReq('/api/distributions', { propertyId: 'p1', period: '2026-02', managementFeePct: 8 }))
    assert.equal(res.status, 401)
  })

  test('rejects missing required fields', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    const res = await distributionsPOST(jsonReq('/api/distributions', { propertyId: 'p1' }))
    assert.equal(res.status, 400)
  })
})

describe('PATCH /api/distributions/[id]', { concurrency: 1 }, () => {
  const origGetSession = sessionProvider.getSession

  afterEach(() => {
    sessionProvider.getSession = origGetSession
  })

  test('denies TENANT role', async () => {
    sessionProvider.getSession = async () => makeSession('TENANT', 't1')
    const res = await distributionPATCH(patchReq('/api/distributions/d1', { status: 'APPROVED' }), { params: { id: 'd1' } })
    assert.equal(res.status, 401)
  })

  test('rejects invalid status values', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    const res = await distributionPATCH(patchReq('/api/distributions/d1', { status: 'INVALID' }), { params: { id: 'd1' } })
    assert.equal(res.status, 400)
  })

  test('rejects DRAFT status (only APPROVED/PAID)', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    const res = await distributionPATCH(patchReq('/api/distributions/d1', { status: 'DRAFT' }), { params: { id: 'd1' } })
    assert.equal(res.status, 400)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature 5: Multi-Org / White-Label
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GET /api/org/settings', { concurrency: 1 }, () => {
  const origGetSession = sessionProvider.getSession

  afterEach(() => {
    sessionProvider.getSession = origGetSession
  })

  test('denies unauthenticated requests', async () => {
    sessionProvider.getSession = async () => null
    const res = await orgSettingsGET()
    assert.equal(res.status, 401)
  })

  test('returns empty object for user without org', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1', null)
    const res = await orgSettingsGET()
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.deepEqual(data, {})
  })
})

describe('PATCH /api/org/settings', { concurrency: 1 }, () => {
  const origGetSession = sessionProvider.getSession

  afterEach(() => {
    sessionProvider.getSession = origGetSession
  })

  test('denies unauthenticated requests', async () => {
    sessionProvider.getSession = async () => null
    const res = await orgSettingsPATCH(patchReq('/api/org/settings', { name: 'test' }))
    assert.equal(res.status, 401)
  })

  test('denies MANAGER role', async () => {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'm1')
    const res = await orgSettingsPATCH(patchReq('/api/org/settings', { name: 'test' }))
    assert.equal(res.status, 401)
  })

  test('denies TENANT role', async () => {
    sessionProvider.getSession = async () => makeSession('TENANT', 't1')
    const res = await orgSettingsPATCH(patchReq('/api/org/settings', { name: 'test' }))
    assert.equal(res.status, 401)
  })

  test('denies VENDOR role', async () => {
    sessionProvider.getSession = async () => makeSession('VENDOR', 'v1')
    const res = await orgSettingsPATCH(patchReq('/api/org/settings', { name: 'test' }))
    assert.equal(res.status, 401)
  })

  test('denies OWNER role', async () => {
    sessionProvider.getSession = async () => makeSession('OWNER', 'o1')
    const res = await orgSettingsPATCH(patchReq('/api/org/settings', { name: 'test' }))
    assert.equal(res.status, 401)
  })

  test('ADMIN without orgId gets 400', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1', null)
    const res = await orgSettingsPATCH(patchReq('/api/org/settings', { name: 'test' }))
    assert.equal(res.status, 400)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cross-cutting: orgScopeWhere, permissions, isOwner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('orgScopeWhere', { concurrency: 1 }, () => {
  test('returns orgId filter when user has org', () => {
    const session = makeSession('MANAGER', 'm1', 'org-123')
    assert.deepEqual(orgScopeWhere(session), { orgId: 'org-123' })
  })

  test('returns empty filter for user without org (super-admin)', () => {
    const session = makeSession('ADMIN', 'a1', null)
    assert.deepEqual(orgScopeWhere(session), {})
  })
})

describe('isOwner helper', { concurrency: 1 }, () => {
  test('returns true for OWNER role', () => {
    assert.equal(isOwner(makeSession('OWNER', 'o1')), true)
  })

  test('returns false for other roles', () => {
    assert.equal(isOwner(makeSession('ADMIN', 'a1')), false)
    assert.equal(isOwner(makeSession('MANAGER', 'm1')), false)
    assert.equal(isOwner(makeSession('TENANT', 't1')), false)
    assert.equal(isOwner(makeSession('VENDOR', 'v1')), false)
  })
})

describe('OWNER permissions', { concurrency: 1 }, () => {
  test('OWNER can read properties, leases, ledger, reports', () => {
    assert.equal(hasPermission('OWNER' as SystemRole, Permission.PROPERTIES_READ), true)
    assert.equal(hasPermission('OWNER' as SystemRole, Permission.LEASES_READ), true)
    assert.equal(hasPermission('OWNER' as SystemRole, Permission.LEDGER_READ), true)
    assert.equal(hasPermission('OWNER' as SystemRole, Permission.REPORTS_READ), true)
  })

  test('OWNER cannot write properties, units, tenants, leases', () => {
    assert.equal(hasPermission('OWNER' as SystemRole, Permission.PROPERTIES_WRITE), false)
    assert.equal(hasPermission('OWNER' as SystemRole, Permission.UNITS_WRITE), false)
    assert.equal(hasPermission('OWNER' as SystemRole, Permission.TENANTS_WRITE), false)
    assert.equal(hasPermission('OWNER' as SystemRole, Permission.LEASES_WRITE), false)
  })

  test('OWNER cannot access admin, audit, workorders write, vendors write', () => {
    assert.equal(hasPermission('OWNER' as SystemRole, Permission.ADMIN_READ), false)
    assert.equal(hasPermission('OWNER' as SystemRole, Permission.AUDIT_READ), false)
    assert.equal(hasPermission('OWNER' as SystemRole, Permission.WORKORDERS_WRITE), false)
    assert.equal(hasPermission('OWNER' as SystemRole, Permission.VENDORS_WRITE), false)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Security hardening tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Onboarding PATCH — ownership enforcement', { concurrency: 1 }, () => {
  const origGetSession = sessionProvider.getSession
  const origFindUnique = (prisma.onboardingChecklist as any).findUnique

  afterEach(() => {
    sessionProvider.getSession = origGetSession
    ;(prisma.onboardingChecklist as any).findUnique = origFindUnique
  })

  test('denies VENDOR role', async () => {
    sessionProvider.getSession = async () => makeSession('VENDOR', 'v1')
    const res = await onboardingPATCH(patchReq('/api/onboarding/c1', { status: 'IN_PROGRESS' }), { params: { id: 'c1' } })
    assert.equal(res.status, 401)
  })

  test('denies OWNER role', async () => {
    sessionProvider.getSession = async () => makeSession('OWNER', 'o1')
    const res = await onboardingPATCH(patchReq('/api/onboarding/c1', { status: 'IN_PROGRESS' }), { params: { id: 'c1' } })
    assert.equal(res.status, 401)
  })

  test('TENANT cannot update another tenant checklist', async () => {
    sessionProvider.getSession = async () => makeSession('TENANT', 'tenant-1')
    ;(prisma.onboardingChecklist as any).findUnique = async () => ({
      id: 'c1',
      lease: {
        tenant: { user: { id: 'tenant-other' } },
        property: { managerId: 'mgr-1' },
      },
    })
    const res = await onboardingPATCH(patchReq('/api/onboarding/c1', { status: 'IN_PROGRESS' }), { params: { id: 'c1' } })
    assert.equal(res.status, 403)
  })

  test('MANAGER cannot update checklist on unmanaged property', async () => {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.onboardingChecklist as any).findUnique = async () => ({
      id: 'c1',
      lease: {
        tenant: { user: { id: 'tenant-1' } },
        property: { managerId: 'mgr-other' },
      },
    })
    const res = await onboardingPATCH(patchReq('/api/onboarding/c1', { status: 'IN_PROGRESS' }), { params: { id: 'c1' } })
    assert.equal(res.status, 403)
  })
})

describe('Onboarding POST — MANAGER property scope', { concurrency: 1 }, () => {
  const origGetSession = sessionProvider.getSession
  const origLeaseFindUnique = (prisma.lease as any).findUnique

  afterEach(() => {
    sessionProvider.getSession = origGetSession
    ;(prisma.lease as any).findUnique = origLeaseFindUnique
  })

  test('MANAGER cannot create checklist for lease on unmanaged property', async () => {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.lease as any).findUnique = async () => ({
      id: 'l1',
      property: { managerId: 'mgr-other' },
    })
    const res = await onboardingPOST(jsonReq('/api/onboarding', { leaseId: 'l1' }))
    assert.equal(res.status, 403)
  })

  test('rejects non-existent lease', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.lease as any).findUnique = async () => null
    const res = await onboardingPOST(jsonReq('/api/onboarding', { leaseId: 'fake' }))
    assert.equal(res.status, 404)
  })
})

describe('Task complete — role enforcement', { concurrency: 1 }, () => {
  const origGetSession = sessionProvider.getSession

  afterEach(() => {
    sessionProvider.getSession = origGetSession
  })

  test('denies VENDOR role', async () => {
    sessionProvider.getSession = async () => makeSession('VENDOR', 'v1')
    const res = await taskCompletePOST(
      jsonReq('/api/onboarding/c1/tasks/t1/complete', {}),
      { params: { id: 'c1', taskId: 't1' } },
    )
    assert.equal(res.status, 401)
  })

  test('denies OWNER role', async () => {
    sessionProvider.getSession = async () => makeSession('OWNER', 'o1')
    const res = await taskCompletePOST(
      jsonReq('/api/onboarding/c1/tasks/t1/complete', {}),
      { params: { id: 'c1', taskId: 't1' } },
    )
    assert.equal(res.status, 401)
  })
})

describe('Org settings — input validation', { concurrency: 1 }, () => {
  const origGetSession = sessionProvider.getSession

  afterEach(() => {
    sessionProvider.getSession = origGetSession
  })

  test('rejects invalid hex color for primaryColor', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1', 'org-1')
    const res = await orgSettingsPATCH(patchReq('/api/org/settings', { primaryColor: 'not-a-color' }))
    assert.equal(res.status, 400)
  })

  test('rejects invalid hex color for accentColor', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1', 'org-1')
    const res = await orgSettingsPATCH(patchReq('/api/org/settings', { accentColor: 'red' }))
    assert.equal(res.status, 400)
  })

  test('rejects non-HTTPS logoUrl', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1', 'org-1')
    const res = await orgSettingsPATCH(patchReq('/api/org/settings', { logoUrl: 'javascript:alert(1)' }))
    assert.equal(res.status, 400)
  })

  test('rejects invalid domain', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1', 'org-1')
    const res = await orgSettingsPATCH(patchReq('/api/org/settings', { domain: '<script>' }))
    assert.equal(res.status, 400)
  })

  test('rejects invalid email', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1', 'org-1')
    const res = await orgSettingsPATCH(patchReq('/api/org/settings', { supportEmail: 'not-an-email' }))
    assert.equal(res.status, 400)
  })
})

describe('Bulk renewal — input validation hardening', { concurrency: 1 }, () => {
  const origGetSession = sessionProvider.getSession

  afterEach(() => {
    sessionProvider.getSession = origGetSession
  })

  test('rejects more than 100 leaseIds', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    const ids = Array.from({ length: 101 }, (_, i) => `lease-${i}`)
    const res = await bulkRenewalPOST(jsonReq('/api/leases/bulk-renewal', {
      leaseIds: ids, rentAdjustmentType: 'pct', rentAdjustmentValue: 3, termMonths: 12, expiryDays: 14,
    }))
    assert.equal(res.status, 400)
  })

  test('rejects invalid rentAdjustmentType', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    const res = await bulkRenewalPOST(jsonReq('/api/leases/bulk-renewal', {
      leaseIds: ['l1'], rentAdjustmentType: 'invalid', rentAdjustmentValue: 3, termMonths: 12, expiryDays: 14,
    }))
    assert.equal(res.status, 400)
  })

  test('rejects termMonths out of range', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    const res = await bulkRenewalPOST(jsonReq('/api/leases/bulk-renewal', {
      leaseIds: ['l1'], rentAdjustmentType: 'pct', rentAdjustmentValue: 3, termMonths: 200, expiryDays: 14,
    }))
    assert.equal(res.status, 400)
  })
})

describe('Distribution POST — input validation hardening', { concurrency: 1 }, () => {
  const origGetSession = sessionProvider.getSession

  afterEach(() => {
    sessionProvider.getSession = origGetSession
  })

  test('rejects managementFeePct > 100', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    const res = await distributionsPOST(jsonReq('/api/distributions', {
      propertyId: 'p1', period: '2026-02', managementFeePct: 150,
    }))
    assert.equal(res.status, 400)
  })

  test('rejects negative managementFeePct', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    const res = await distributionsPOST(jsonReq('/api/distributions', {
      propertyId: 'p1', period: '2026-02', managementFeePct: -5,
    }))
    assert.equal(res.status, 400)
  })

  test('rejects invalid period format', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    const res = await distributionsPOST(jsonReq('/api/distributions', {
      propertyId: 'p1', period: 'February 2026', managementFeePct: 8,
    }))
    assert.equal(res.status, 400)
  })
})
