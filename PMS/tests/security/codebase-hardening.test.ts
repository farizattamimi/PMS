import { describe, test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { sessionProvider } from '@/lib/session-provider'

// ── Route handlers ──────────────────────────────────────────────────────
import { GET as unitGET, PATCH as unitPATCH } from '@/app/api/units/[id]/route'
import { POST as unitPOST } from '@/app/api/units/route'
import { GET as leaseDetailGET, PATCH as leasePATCH } from '@/app/api/leases/[id]/route'
import { POST as leasePOST } from '@/app/api/leases/route'
import { GET as tenantsGET } from '@/app/api/tenants/route'
import { GET as tenantDetailGET, PATCH as tenantPATCH } from '@/app/api/tenants/[id]/route'
import { PATCH as incidentPATCH } from '@/app/api/incidents/[id]/route'
import { POST as incidentPOST } from '@/app/api/incidents/route'
import { PATCH as compliancePATCH, DELETE as complianceDELETE } from '@/app/api/compliance/[id]/route'
import { POST as compliancePOST } from '@/app/api/compliance/route'
import { GET as assetDetailGET, PATCH as assetPATCH, DELETE as assetDELETE } from '@/app/api/assets/[id]/route'
import { GET as assetsGET, POST as assetPOST } from '@/app/api/assets/route'
import { PATCH as pmSchedulePATCH, DELETE as pmScheduleDELETE } from '@/app/api/pm-schedules/[id]/route'
import { POST as pmSchedulePOST } from '@/app/api/pm-schedules/route'
import { PATCH as inspItemPATCH, DELETE as inspItemDELETE } from '@/app/api/inspections/[id]/items/[itemId]/route'
import { POST as inspItemPOST } from '@/app/api/inspections/[id]/items/route'
import { POST as inspectionPOST } from '@/app/api/inspections/route'
import { GET as inspDetailGET, PATCH as inspDetailPATCH } from '@/app/api/inspections/[id]/route'
import { PATCH as ledgerPATCH } from '@/app/api/ledger/[id]/route'
import { POST as budgetPOST } from '@/app/api/budgets/route'
import { GET as appGET, PATCH as appPATCH } from '@/app/api/applications/[id]/route'
import { PATCH as propertyPATCH } from '@/app/api/properties/[id]/route'
import { POST as propVendorPOST } from '@/app/api/properties/[id]/vendors/route'
import { DELETE as propVendorDELETE } from '@/app/api/properties/[id]/vendors/[vendorId]/route'
import { POST as woCostPOST } from '@/app/api/workorders/[id]/costs/route'
import { GET as vendorDetailGET, PATCH as vendorPATCH } from '@/app/api/vendors/[id]/route'
import { POST as vendorInvitePOST } from '@/app/api/vendors/[id]/invite/route'
import { POST as renewalOfferPOST } from '@/app/api/leases/[id]/renewal-offer/route'

// ── Helpers ──────────────────────────────────────────────────────────────
function makeSession(role: string, id: string): Session {
  return {
    user: { id, systemRole: role as any, name: 'Test', email: 't@t.com', image: null, orgId: null },
    expires: '2099-01-01T00:00:00.000Z',
  }
}
function jsonReq(url: string, body: any): Request {
  return new Request(`http://localhost${url}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
function patchReq(url: string, body: any): Request {
  return new Request(`http://localhost${url}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
function deleteReq(url: string): Request {
  return new Request(`http://localhost${url}`, { method: 'DELETE' })
}

// Single flat describe to avoid Node 18 nested-describe double-execution bug
describe('Codebase Hardening Security Tests', { concurrency: 1 }, () => {
  const origGetSession = sessionProvider.getSession
  const originals: Record<string, any> = {}
  let auditCalled = false

  function savePrisma(model: string, method: string) {
    const key = `${model}.${method}`
    if (!(key in originals)) originals[key] = (prisma as any)[model][method]
  }
  function restoreAll() {
    sessionProvider.getSession = origGetSession
    for (const [key, fn] of Object.entries(originals)) {
      const [model, method] = key.split('.')
      ;(prisma as any)[model][method] = fn
    }
    for (const k of Object.keys(originals)) delete originals[k]
    auditCalled = false
  }
  afterEach(restoreAll)

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Category A: IDOR scope on [id] routes
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  test('A1: MANAGER cannot GET unit on unmanaged property', async () => {
    savePrisma('unit', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.unit as any).findUnique = async () => ({
      id: 'u1', propertyId: 'p-other',
      property: { id: 'p-other', managerId: 'mgr-other' },
      building: null, leases: [], workOrders: [],
    })
    const res = await unitGET(new Request('http://localhost/api/units/u1'), { params: { id: 'u1' } })
    assert.equal(res.status, 403)
  })

  test('A1: ADMIN bypasses unit scope check', async () => {
    savePrisma('unit', 'findUnique')
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.unit as any).findUnique = async () => ({
      id: 'u1', propertyId: 'p-other',
      property: { id: 'p-other', managerId: 'mgr-other' },
      building: null, leases: [], workOrders: [],
    })
    const res = await unitGET(new Request('http://localhost/api/units/u1'), { params: { id: 'u1' } })
    assert.equal(res.status, 200)
  })

  test('A1: MANAGER cannot PATCH unit on unmanaged property', async () => {
    savePrisma('unit', 'findUnique')
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.unit as any).findUnique = async () => ({
      id: 'u1', propertyId: 'p-other', status: 'AVAILABLE',
    })
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'mgr-other' })
    const res = await unitPATCH(
      patchReq('/api/units/u1', { unitNumber: '101' }),
      { params: { id: 'u1' } }
    )
    assert.equal(res.status, 403)
  })

  test('A2: MANAGER cannot GET lease on unmanaged property', async () => {
    savePrisma('lease', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.lease as any).findUnique = async () => ({
      id: 'l1', propertyId: 'p-other',
      unit: { property: { managerId: 'mgr-other' } },
      tenant: { user: { name: 'T', email: 't@t.com' } },
      ledgerEntries: [],
    })
    const res = await leaseDetailGET(new Request('http://localhost/api/leases/l1'), { params: { id: 'l1' } })
    assert.equal(res.status, 403)
  })

  test('A3: MANAGER cannot GET tenant on unmanaged property', async () => {
    savePrisma('tenant', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.tenant as any).findUnique = async () => ({
      id: 't1', user: { id: 'u1', name: 'T', email: 't@t.com' },
      leases: [{ unit: { property: { id: 'p-other', name: 'Other', managerId: 'mgr-other' } } }],
    })
    const res = await tenantDetailGET(new Request('http://localhost/api/tenants/t1'), { params: { id: 't1' } })
    assert.equal(res.status, 403)
  })

  test('A4: MANAGER cannot PATCH incident on unmanaged property', async () => {
    savePrisma('incident', 'findUnique')
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.incident as any).findUnique = async () => ({
      id: 'i1', propertyId: 'p-other',
    })
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'mgr-other' })
    const res = await incidentPATCH(
      patchReq('/api/incidents/i1', { status: 'RESOLVED' }),
      { params: { id: 'i1' } }
    )
    assert.equal(res.status, 403)
  })

  test('A5: MANAGER cannot PATCH compliance item on unmanaged property', async () => {
    savePrisma('complianceItem', 'findUnique')
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.complianceItem as any).findUnique = async () => ({
      id: 'c1', propertyId: 'p-other', completedAt: null, renewalDays: null,
    })
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'mgr-other' })
    const res = await compliancePATCH(
      patchReq('/api/compliance/c1', { title: 'X' }),
      { params: { id: 'c1' } }
    )
    assert.equal(res.status, 403)
  })

  test('A5: MANAGER cannot DELETE compliance item on unmanaged property', async () => {
    savePrisma('complianceItem', 'findUnique')
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.complianceItem as any).findUnique = async () => ({
      id: 'c1', propertyId: 'p-other',
    })
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'mgr-other' })
    const res = await complianceDELETE(
      deleteReq('/api/compliance/c1'),
      { params: { id: 'c1' } }
    )
    assert.equal(res.status, 403)
  })

  test('A6: MANAGER cannot GET asset on unmanaged property', async () => {
    savePrisma('asset', 'findUnique')
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.asset as any).findUnique = async () => ({
      id: 'a1', propertyId: 'p-other',
      property: { id: 'p-other', name: 'O' },
      unit: null,
    })
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'mgr-other' })
    const res = await assetDetailGET(new Request('http://localhost/api/assets/a1'), { params: { id: 'a1' } })
    assert.equal(res.status, 403)
  })

  test('A6: MANAGER cannot DELETE asset on unmanaged property', async () => {
    savePrisma('asset', 'findUnique')
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.asset as any).findUnique = async () => ({
      id: 'a1', propertyId: 'p-other',
    })
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'mgr-other' })
    const res = await assetDELETE(deleteReq('/api/assets/a1'), { params: { id: 'a1' } })
    assert.equal(res.status, 403)
  })

  test('A7: MANAGER cannot PATCH pm-schedule on unmanaged property', async () => {
    savePrisma('pMSchedule', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.pMSchedule as any).findUnique = async () => ({
      id: 'pm1', assetId: 'a1',
      asset: { property: { managerId: 'mgr-other' } },
    })
    const res = await pmSchedulePATCH(
      patchReq('/api/pm-schedules/pm1', { title: 'X' }),
      { params: { id: 'pm1' } }
    )
    assert.equal(res.status, 403)
  })

  test('A8: MANAGER cannot PATCH inspection item on unmanaged property', async () => {
    savePrisma('inspectionItem', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.inspectionItem as any).findUnique = async () => ({
      id: 'ii1', inspectionId: 'insp1',
      inspection: { propertyId: 'p-other', property: { managerId: 'mgr-other' } },
    })
    const res = await inspItemPATCH(
      patchReq('/api/inspections/insp1/items/ii1', { notes: 'x' }),
      { params: { id: 'insp1', itemId: 'ii1' } }
    )
    assert.equal(res.status, 403)
  })

  test('A9: MANAGER cannot PATCH ledger entry on unmanaged property', async () => {
    savePrisma('ledgerEntry', 'findUnique')
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.ledgerEntry as any).findUnique = async () => ({
      id: 'le1', propertyId: 'p-other', lease: null,
    })
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'mgr-other' })
    const res = await ledgerPATCH(
      patchReq('/api/ledger/le1', { memo: 'test' }),
      { params: { id: 'le1' } }
    )
    assert.equal(res.status, 403)
  })

  test('A10: MANAGER cannot GET application on unmanaged property', async () => {
    savePrisma('tenantApplication', 'findUnique')
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.tenantApplication as any).findUnique = async () => ({
      id: 'app1', propertyId: 'p-other',
      property: { id: 'p-other', name: 'Other', managerId: 'mgr-other' },
      unit: null, tenant: null, screeningReports: [],
    })
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'mgr-other' })
    const res = await appGET(new Request('http://localhost/api/applications/app1'), { params: { id: 'app1' } })
    assert.equal(res.status, 403)
  })

  test('A11: MANAGER cannot GET vendor not linked to their property', async () => {
    savePrisma('vendor', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.vendor as any).findUnique = async () => ({
      id: 'v1',
      propertyVendors: [{ property: { id: 'p-other', name: 'O', managerId: 'mgr-other' } }],
      workOrders: [], reviews: [], _count: { workOrders: 0 },
    })
    const res = await vendorDetailGET(new Request('http://localhost/api/vendors/v1'), { params: { id: 'v1' } })
    assert.equal(res.status, 403)
  })

  test('A12: ADMIN bypasses asset scope check', async () => {
    savePrisma('asset', 'findUnique')
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.asset as any).findUnique = async () => ({
      id: 'a1', propertyId: 'p-other',
      property: { id: 'p-other', name: 'O' },
      unit: null,
    })
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'mgr-other' })
    const res = await assetDetailGET(new Request('http://localhost/api/assets/a1'), { params: { id: 'a1' } })
    assert.equal(res.status, 200)
  })

  test('A13: ADMIN bypasses inspection scope check', async () => {
    savePrisma('inspection', 'findUnique')
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.inspection as any).findUnique = async () => ({
      id: 'insp1', propertyId: 'p-other',
      property: { id: 'p-other', name: 'O' },
      unit: null, items: [],
    })
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'mgr-other' })
    const res = await inspDetailGET(new Request('http://localhost/api/inspections/insp1'), { params: { id: 'insp1' } })
    assert.equal(res.status, 200)
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Category B: POST ownership checks
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  test('B1: MANAGER cannot create unit on unmanaged property', async () => {
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'mgr-other' })
    const res = await unitPOST(
      jsonReq('/api/units', { propertyId: 'p-other', unitNumber: '101', bedrooms: 2, bathrooms: 1, sqFt: 800, monthlyRent: 1500 })
    )
    assert.equal(res.status, 403)
  })

  test('B2: MANAGER cannot create lease on unmanaged property', async () => {
    savePrisma('unit', 'findUnique')
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.unit as any).findUnique = async () => ({ propertyId: 'p-other' })
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'mgr-other' })
    const res = await leasePOST(
      jsonReq('/api/leases', { unitId: 'u1', tenantId: 't1', startDate: '2026-01-01', endDate: '2027-01-01', monthlyRent: 1500 })
    )
    assert.equal(res.status, 403)
  })

  test('B3: MANAGER cannot create compliance item on unmanaged property', async () => {
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'mgr-other' })
    const res = await compliancePOST(
      jsonReq('/api/compliance', { propertyId: 'p-other', title: 'Fire Cert', category: 'FIRE_SAFETY', dueDate: '2026-06-01' })
    )
    assert.equal(res.status, 403)
  })

  test('B4: MANAGER cannot create inspection on unmanaged property', async () => {
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'mgr-other' })
    const res = await inspectionPOST(
      jsonReq('/api/inspections', { propertyId: 'p-other', type: 'MOVE_IN', scheduledAt: '2026-06-01' })
    )
    assert.equal(res.status, 403)
  })

  test('B5: MANAGER cannot create budget on unmanaged property', async () => {
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'mgr-other' })
    const res = await budgetPOST(
      jsonReq('/api/budgets', { propertyId: 'p-other', period: '2026-03', category: 'MAINTENANCE', budgetedAmount: 5000 })
    )
    assert.equal(res.status, 403)
  })

  test('B6: MANAGER cannot link vendor to unmanaged property', async () => {
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'mgr-other' })
    const res = await propVendorPOST(
      jsonReq('/api/properties/p-other/vendors', { vendorId: 'v1' }),
      { params: { id: 'p-other' } }
    )
    assert.equal(res.status, 403)
  })

  test('B7: MANAGER cannot unlink vendor from unmanaged property', async () => {
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'mgr-other' })
    const res = await propVendorDELETE(
      deleteReq('/api/properties/p-other/vendors/v1'),
      { params: { id: 'p-other', vendorId: 'v1' } }
    )
    assert.equal(res.status, 403)
  })

  test('B8: MANAGER cannot create renewal offer on unmanaged property', async () => {
    savePrisma('lease', 'findUnique')
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.lease as any).findUnique = async () => ({
      id: 'l1', propertyId: 'p-other',
      tenant: { user: { id: 'tu1', name: 'T' } },
      unit: { propertyId: 'p-other', unitNumber: '1A', property: { id: 'p-other', name: 'O' } },
    })
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'mgr-other' })
    const res = await renewalOfferPOST(
      jsonReq('/api/leases/l1/renewal-offer', { offeredRent: 1500, termMonths: 12, expiryDate: '2026-12-31' }),
      { params: { id: 'l1' } }
    )
    assert.equal(res.status, 403)
  })

  test('B9: MANAGER cannot create asset on unmanaged property', async () => {
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'mgr-other' })
    const res = await assetPOST(
      jsonReq('/api/assets', { propertyId: 'p-other', name: 'HVAC Unit', category: 'HVAC' })
    )
    assert.equal(res.status, 403)
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Category C: Field whitelisting
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  test('C1: properties PATCH does not accept managerId or orgId', async () => {
    savePrisma('property', 'findFirst')
    savePrisma('property', 'update')
    savePrisma('auditLog', 'create')
    let capturedData: any = null
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.property as any).findFirst = async () => ({ id: 'p1', status: 'ACTIVE' })
    ;(prisma.property as any).update = async (args: any) => {
      capturedData = args.data
      return { id: 'p1', ...args.data }
    }
    ;(prisma.auditLog as any).create = async () => ({})

    await propertyPATCH(
      patchReq('/api/properties/p1', { name: 'New Name', managerId: 'hacker', orgId: 'evil-org' }),
      { params: { id: 'p1' } }
    )
    assert.equal(capturedData.name, 'New Name')
    assert.equal(capturedData.managerId, undefined, 'managerId should not be in update data')
    assert.equal(capturedData.orgId, undefined, 'orgId should not be in update data')
  })

  test('C2: units PATCH does not accept propertyId', async () => {
    savePrisma('unit', 'findUnique')
    savePrisma('unit', 'update')
    savePrisma('property', 'findUnique')
    savePrisma('auditLog', 'create')
    let capturedData: any = null
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.unit as any).findUnique = async () => ({ id: 'u1', propertyId: 'p1', status: 'AVAILABLE' })
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'admin-1' })
    ;(prisma.unit as any).update = async (args: any) => {
      capturedData = args.data
      return { id: 'u1', ...args.data }
    }
    ;(prisma.auditLog as any).create = async () => ({})

    await unitPATCH(
      patchReq('/api/units/u1', { unitNumber: '202', propertyId: 'p-hacked', managerId: 'hacker' }),
      { params: { id: 'u1' } }
    )
    assert.ok(capturedData, 'unit.update should have been called')
    assert.equal(capturedData.unitNumber, '202')
    assert.equal(capturedData.propertyId, undefined, 'propertyId should not be in update data')
    assert.equal(capturedData.managerId, undefined, 'managerId should not be in update data')
  })

  test('C3: leases PATCH does not accept tenantId, unitId, or propertyId', async () => {
    savePrisma('lease', 'findUnique')
    savePrisma('property', 'findUnique')
    savePrisma('auditLog', 'create')
    let capturedData: any = null
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.lease as any).findUnique = async () => ({
      id: 'l1', propertyId: 'p1', status: 'DRAFT', unitId: 'u1', tenantId: 't1',
      unit: { propertyId: 'p1' },
    })
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'admin-1' })

    const tx = {
      lease: {
        update: async (args: any) => {
          capturedData = args.data
          return { id: 'l1', unitId: 'u1', tenantId: 't1', ...args.data }
        },
      },
      unit: { update: async () => ({}) },
      tenant: { updateMany: async () => ({}) },
    }
    savePrisma('$transaction', 'bind')
    ;(prisma as any).$transaction = async (fn: any) => fn(tx)
    ;(prisma.auditLog as any).create = async () => ({})

    await leasePATCH(
      patchReq('/api/leases/l1', { monthlyRent: 2000, tenantId: 't-hacked', unitId: 'u-hacked', propertyId: 'p-hacked' }),
      { params: { id: 'l1' } }
    )
    assert.equal(capturedData.monthlyRent, 2000)
    assert.equal(capturedData.tenantId, undefined, 'tenantId should not be in update data')
    assert.equal(capturedData.unitId, undefined, 'unitId should not be in update data')
    assert.equal(capturedData.propertyId, undefined, 'propertyId should not be in update data')
  })

  test('C4: properties PATCH accepts allowed fields', async () => {
    savePrisma('property', 'findFirst')
    savePrisma('property', 'update')
    savePrisma('auditLog', 'create')
    let capturedData: any = null
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.property as any).findFirst = async () => ({ id: 'p1', status: 'ACTIVE' })
    ;(prisma.property as any).update = async (args: any) => {
      capturedData = args.data
      return { id: 'p1', ...args.data }
    }
    ;(prisma.auditLog as any).create = async () => ({})

    await propertyPATCH(
      patchReq('/api/properties/p1', { name: 'X', address: 'Y', city: 'Z', state: 'CA', zip: '90001', type: 'RESIDENTIAL' }),
      { params: { id: 'p1' } }
    )
    assert.equal(capturedData.name, 'X')
    assert.equal(capturedData.address, 'Y')
    assert.equal(capturedData.city, 'Z')
    assert.equal(capturedData.state, 'CA')
    assert.equal(capturedData.zip, '90001')
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Category D: Audit logging
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  test('D1: workorders/[id]/costs POST calls writeAudit', async () => {
    savePrisma('workOrder', 'findFirst')
    savePrisma('workOrderCost', 'create')
    savePrisma('auditLog', 'create')
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.workOrder as any).findFirst = async () => ({ id: 'wo1' })
    ;(prisma.workOrderCost as any).create = async () => ({ id: 'woc1', amount: 100 })
    ;(prisma.auditLog as any).create = async () => { auditCalled = true; return {} }
    await woCostPOST(
      jsonReq('/api/workorders/wo1/costs', { amount: 100 }),
      { params: { id: 'wo1' } }
    )
    assert.equal(auditCalled, true, 'writeAudit should have been called')
  })

  test('D2: inspections/[id]/items POST calls writeAudit', async () => {
    savePrisma('inspection', 'findUnique')
    savePrisma('inspectionItem', 'create')
    savePrisma('property', 'findUnique')
    savePrisma('auditLog', 'create')
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.inspection as any).findUnique = async () => ({ id: 'insp1', propertyId: 'p1' })
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'admin-1' })
    ;(prisma.inspectionItem as any).create = async () => ({ id: 'ii1', area: 'Kitchen', asset: null })
    ;(prisma.auditLog as any).create = async () => { auditCalled = true; return {} }
    await inspItemPOST(
      jsonReq('/api/inspections/insp1/items', { area: 'Kitchen' }),
      { params: { id: 'insp1' } }
    )
    assert.equal(auditCalled, true, 'writeAudit should have been called')
  })

  test('D3: inspections/[id]/items/[itemId] PATCH calls writeAudit', async () => {
    savePrisma('inspectionItem', 'findUnique')
    savePrisma('inspectionItem', 'update')
    savePrisma('auditLog', 'create')
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.inspectionItem as any).findUnique = async () => ({
      id: 'ii1', inspectionId: 'insp1',
      inspection: { propertyId: 'p1', property: { managerId: 'admin-1' } },
    })
    ;(prisma.inspectionItem as any).update = async () => ({ id: 'ii1', notes: 'OK' })
    ;(prisma.auditLog as any).create = async () => { auditCalled = true; return {} }
    await inspItemPATCH(
      patchReq('/api/inspections/insp1/items/ii1', { notes: 'OK' }),
      { params: { id: 'insp1', itemId: 'ii1' } }
    )
    assert.equal(auditCalled, true, 'writeAudit should have been called')
  })

  test('D4: inspections/[id]/items/[itemId] DELETE calls writeAudit', async () => {
    savePrisma('inspectionItem', 'findUnique')
    savePrisma('inspectionItem', 'delete')
    savePrisma('auditLog', 'create')
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.inspectionItem as any).findUnique = async () => ({
      id: 'ii1', inspectionId: 'insp1',
      inspection: { propertyId: 'p1', property: { managerId: 'admin-1' } },
    })
    ;(prisma.inspectionItem as any).delete = async () => ({})
    ;(prisma.auditLog as any).create = async () => { auditCalled = true; return {} }
    await inspItemDELETE(
      deleteReq('/api/inspections/insp1/items/ii1'),
      { params: { id: 'insp1', itemId: 'ii1' } }
    )
    assert.equal(auditCalled, true, 'writeAudit should have been called')
  })

  test('D5: vendors/[id]/invite POST calls writeAudit', async () => {
    savePrisma('vendor', 'findUnique')
    savePrisma('user', 'findUnique')
    savePrisma('user', 'create')
    savePrisma('vendor', 'update')
    savePrisma('auditLog', 'create')
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.vendor as any).findUnique = async () => ({ id: 'v1', name: 'V', email: 'v@v.com', userId: null })
    ;(prisma.user as any).findUnique = async () => null
    ;(prisma.user as any).create = async () => ({ id: 'u-new', email: 'vp@v.com' })
    ;(prisma.vendor as any).update = async () => ({})
    ;(prisma.auditLog as any).create = async () => { auditCalled = true; return {} }

    await vendorInvitePOST(
      jsonReq('/api/vendors/v1/invite', { email: 'vp@v.com', name: 'V Portal', password: 'testtest1' }),
      { params: { id: 'v1' } }
    )
    assert.equal(auditCalled, true, 'writeAudit should have been called')
  })

  test('D6: properties/[id]/vendors POST calls writeAudit', async () => {
    savePrisma('property', 'findUnique')
    savePrisma('propertyVendor', 'upsert')
    savePrisma('auditLog', 'create')
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'admin-1' })
    ;(prisma.propertyVendor as any).upsert = async () => ({ propertyId: 'p1', vendorId: 'v1' })
    ;(prisma.auditLog as any).create = async () => { auditCalled = true; return {} }
    await propVendorPOST(
      jsonReq('/api/properties/p1/vendors', { vendorId: 'v1' }),
      { params: { id: 'p1' } }
    )
    assert.equal(auditCalled, true, 'writeAudit should have been called')
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Category E: Input validation
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  test('E1: incidents POST rejects invalid severity', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    const res = await incidentPOST(
      jsonReq('/api/incidents', { propertyId: 'p1', category: 'FIRE', title: 'Test', description: 'X', severity: 'SUPER_HIGH' })
    )
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.ok(body.error.includes('severity'))
  })

  test('E2: inspection items POST rejects invalid condition', async () => {
    savePrisma('inspection', 'findUnique')
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.inspection as any).findUnique = async () => ({ id: 'insp1', propertyId: 'p1' })
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'admin-1' })
    const res = await inspItemPOST(
      jsonReq('/api/inspections/insp1/items', { area: 'Kitchen', condition: 'TERRIBLE' }),
      { params: { id: 'insp1' } }
    )
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.ok(body.error.includes('condition'))
  })

  test('E3: pm-schedules POST rejects non-positive frequencyDays', async () => {
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    const res = await pmSchedulePOST(
      jsonReq('/api/pm-schedules', { assetId: 'a1', title: 'Test', frequencyDays: -5, nextDueAt: '2026-06-01' })
    )
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.ok(body.error.includes('frequencyDays'))
  })

  test('E4: applications PATCH rejects invalid status', async () => {
    savePrisma('tenantApplication', 'findUnique')
    savePrisma('property', 'findUnique')
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.tenantApplication as any).findUnique = async () => ({ id: 'app1', propertyId: 'p1' })
    ;(prisma.property as any).findUnique = async () => ({ managerId: 'admin-1' })
    const res = await appPATCH(
      patchReq('/api/applications/app1', { status: 'FAKE_STATUS' }),
      { params: { id: 'app1' } }
    )
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.ok(body.error.includes('status'))
  })

  test('E5: inspection items PATCH rejects invalid condition', async () => {
    savePrisma('inspectionItem', 'findUnique')
    sessionProvider.getSession = async () => makeSession('ADMIN', 'admin-1')
    ;(prisma.inspectionItem as any).findUnique = async () => ({
      id: 'ii1', inspectionId: 'insp1',
      inspection: { propertyId: 'p1', property: { managerId: 'admin-1' } },
    })
    const res = await inspItemPATCH(
      patchReq('/api/inspections/insp1/items/ii1', { condition: 'TERRIBLE' }),
      { params: { id: 'insp1', itemId: 'ii1' } }
    )
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.ok(body.error.includes('condition'))
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Category F: Scope gaps
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  test('F1: assets GET applies manager scope when no propertyId filter', async () => {
    savePrisma('asset', 'findMany')
    let capturedWhere: any = null
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.asset as any).findMany = async (args: any) => {
      capturedWhere = args.where
      return []
    }
    const res = await assetsGET(new Request('http://localhost/api/assets'))
    assert.equal(res.status, 200)
    assert.deepEqual(capturedWhere.property, { managerId: 'mgr-1' })
  })
})
