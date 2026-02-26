import {
  PrismaClient,
  SystemRole,
  UnitStatus,
  LeaseStatus,
  WorkOrderPriority,
  WorkOrderStatus,
  WorkOrderCategory,
  WorkOrderCostType,
  LedgerEntryType,
  AuditAction,
  TenantStatus,
  PropertyStatus,
  OrgType,
  VendorStatus,
} from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const hash = (pw: string) => bcrypt.hash(pw, 10)

async function main() {
  console.log('🌱 Seeding database…')

  // ── Organization ─────────────────────────────────────────────────
  const acme = await prisma.organization.upsert({
    where: { id: 'org-acme' },
    update: {},
    create: { id: 'org-acme', name: 'Acme Residential', type: OrgType.OPERATOR, status: 'ACTIVE' },
  })

  // ── Users ────────────────────────────────────────────────────────
  const [admin, manager1, manager2, t1User, t2User, t3User, t4User, t5User] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'admin@pms.dev' },
      update: {},
      create: { name: 'Alice Admin', email: 'admin@pms.dev', passwordHash: await hash('password123'), systemRole: SystemRole.ADMIN, orgId: acme.id },
    }),
    prisma.user.upsert({
      where: { email: 'manager@pms.dev' },
      update: {},
      create: { name: 'Bob Manager', email: 'manager@pms.dev', passwordHash: await hash('password123'), systemRole: SystemRole.MANAGER, orgId: acme.id },
    }),
    prisma.user.upsert({
      where: { email: 'manager2@pms.dev' },
      update: {},
      create: { name: 'Carol Manager', email: 'manager2@pms.dev', passwordHash: await hash('password123'), systemRole: SystemRole.MANAGER, orgId: acme.id },
    }),
    prisma.user.upsert({
      where: { email: 'tenant@pms.dev' },
      update: {},
      create: { name: 'Dan Tenant', email: 'tenant@pms.dev', passwordHash: await hash('password123'), systemRole: SystemRole.TENANT },
    }),
    prisma.user.upsert({
      where: { email: 'eve@pms.dev' },
      update: {},
      create: { name: 'Eve Williams', email: 'eve@pms.dev', passwordHash: await hash('password123'), systemRole: SystemRole.TENANT },
    }),
    prisma.user.upsert({
      where: { email: 'frank@pms.dev' },
      update: {},
      create: { name: 'Frank Brown', email: 'frank@pms.dev', passwordHash: await hash('password123'), systemRole: SystemRole.TENANT },
    }),
    prisma.user.upsert({
      where: { email: 'grace@pms.dev' },
      update: {},
      create: { name: 'Grace Lee', email: 'grace@pms.dev', passwordHash: await hash('password123'), systemRole: SystemRole.TENANT },
    }),
    prisma.user.upsert({
      where: { email: 'hank@pms.dev' },
      update: {},
      create: { name: 'Hank Davis', email: 'hank@pms.dev', passwordHash: await hash('password123'), systemRole: SystemRole.TENANT },
    }),
  ])

  // ── Properties ───────────────────────────────────────────────────
  const prop1 = await prisma.property.upsert({
    where: { id: 'prop-sunset' },
    update: {},
    create: {
      id: 'prop-sunset',
      name: 'Sunset Apartments',
      address: '100 Sunset Blvd',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      managerId: manager1.id,
      orgId: acme.id,
      status: PropertyStatus.ACTIVE,
      propertyType: 'MULTIFAMILY',
    },
  })
  const prop2 = await prisma.property.upsert({
    where: { id: 'prop-river' },
    update: {},
    create: {
      id: 'prop-river',
      name: 'Riverside Lofts',
      address: '200 River Walk',
      city: 'Austin',
      state: 'TX',
      zip: '78702',
      managerId: manager2.id,
      orgId: acme.id,
      status: PropertyStatus.ACTIVE,
      propertyType: 'MULTIFAMILY',
    },
  })
  const prop3 = await prisma.property.upsert({
    where: { id: 'prop-oak' },
    update: {},
    create: {
      id: 'prop-oak',
      name: 'Oak Hill Commons',
      address: '300 Oak Hill Dr',
      city: 'Austin',
      state: 'TX',
      zip: '78748',
      managerId: manager1.id,
      orgId: acme.id,
      status: PropertyStatus.ONBOARDING,
      propertyType: 'MULTIFAMILY',
    },
  })

  // ── Buildings ────────────────────────────────────────────────────
  const bldA = await prisma.building.upsert({
    where: { id: 'bld-sunset-a' },
    update: {},
    create: { id: 'bld-sunset-a', propertyId: prop1.id, name: 'Building A' },
  })
  const bldB = await prisma.building.upsert({
    where: { id: 'bld-sunset-b' },
    update: {},
    create: { id: 'bld-sunset-b', propertyId: prop1.id, name: 'Building B' },
  })

  // ── Units ────────────────────────────────────────────────────────
  const makeUnit = (id: string, propertyId: string, num: string, beds: number, baths: number, sqft: number, rent: number, status: UnitStatus, buildingId?: string) =>
    prisma.unit.upsert({
      where: { id },
      update: {},
      create: { id, propertyId, unitNumber: num, bedrooms: beds, bathrooms: baths, sqFt: sqft, monthlyRent: rent, marketRent: rent * 1.05, status, buildingId: buildingId ?? null },
    })

  const [u1, u2, u3, u4, u5, u6, u7, u8] = await Promise.all([
    makeUnit('unit-1a', prop1.id, '1A', 1, 1, 650, 1200, UnitStatus.OCCUPIED, bldA.id),
    makeUnit('unit-1b', prop1.id, '1B', 2, 1, 900, 1650, UnitStatus.OCCUPIED, bldA.id),
    makeUnit('unit-2a', prop1.id, '2A', 1, 1, 650, 1250, UnitStatus.AVAILABLE, bldB.id),
    makeUnit('unit-2b', prop1.id, '2B', 3, 2, 1200, 2100, UnitStatus.DOWN, bldB.id),
    makeUnit('unit-r1', prop2.id, '101', 1, 1, 700, 1400, UnitStatus.OCCUPIED),
    makeUnit('unit-r2', prop2.id, '102', 2, 2, 1000, 1850, UnitStatus.OCCUPIED),
    makeUnit('unit-r3', prop2.id, '201', 2, 1, 850, 1600, UnitStatus.AVAILABLE),
    makeUnit('unit-o1', prop3.id, '1', 3, 2, 1400, 2400, UnitStatus.OCCUPIED),
  ])

  // ── Tenants ──────────────────────────────────────────────────────
  const [ten1, ten2, ten3, ten4, ten5] = await Promise.all([
    prisma.tenant.upsert({
      where: { userId: t1User.id },
      update: {},
      create: { userId: t1User.id, phone: '512-555-0101', emergencyContactName: 'Sarah Tenant', emergencyContactPhone: '512-555-0102', status: TenantStatus.ACTIVE, propertyId: prop1.id },
    }),
    prisma.tenant.upsert({
      where: { userId: t2User.id },
      update: {},
      create: { userId: t2User.id, phone: '512-555-0201', emergencyContactName: 'Tom Williams', emergencyContactPhone: '512-555-0202', status: TenantStatus.ACTIVE, propertyId: prop1.id },
    }),
    prisma.tenant.upsert({
      where: { userId: t3User.id },
      update: {},
      create: { userId: t3User.id, phone: '512-555-0301', emergencyContactName: 'Linda Brown', emergencyContactPhone: '512-555-0302', status: TenantStatus.ACTIVE, propertyId: prop2.id },
    }),
    prisma.tenant.upsert({
      where: { userId: t4User.id },
      update: {},
      create: { userId: t4User.id, phone: '512-555-0401', emergencyContactName: 'James Lee', emergencyContactPhone: '512-555-0402', status: TenantStatus.ACTIVE, propertyId: prop2.id },
    }),
    prisma.tenant.upsert({
      where: { userId: t5User.id },
      update: {},
      create: { userId: t5User.id, phone: '512-555-0501', emergencyContactName: 'Maria Davis', emergencyContactPhone: '512-555-0502', status: TenantStatus.PAST, propertyId: prop3.id },
    }),
  ])

  // ── Leases ───────────────────────────────────────────────────────
  const now = new Date()
  const dt = (months: number) => { const d = new Date(now); d.setMonth(d.getMonth() + months); return d }

  const [l1, l2, l3, l4, l5] = await Promise.all([
    prisma.lease.upsert({
      where: { id: 'lease-1' },
      update: {},
      create: { id: 'lease-1', unitId: u1.id, tenantId: ten1.id, propertyId: prop1.id, startDate: dt(-12), endDate: dt(0), monthlyRent: 1200, depositAmount: 2400, status: LeaseStatus.ACTIVE, signedAt: dt(-12) },
    }),
    prisma.lease.upsert({
      where: { id: 'lease-2' },
      update: {},
      create: { id: 'lease-2', unitId: u2.id, tenantId: ten2.id, propertyId: prop1.id, startDate: dt(-6), endDate: dt(6), monthlyRent: 1650, depositAmount: 3300, status: LeaseStatus.ACTIVE, signedAt: dt(-6) },
    }),
    prisma.lease.upsert({
      where: { id: 'lease-3' },
      update: {},
      create: { id: 'lease-3', unitId: u3.id, tenantId: ten3.id, propertyId: prop1.id, startDate: dt(1), endDate: dt(13), monthlyRent: 1250, depositAmount: 2500, status: LeaseStatus.DRAFT },
    }),
    prisma.lease.upsert({
      where: { id: 'lease-4' },
      update: {},
      create: { id: 'lease-4', unitId: u5.id, tenantId: ten3.id, propertyId: prop2.id, startDate: dt(-18), endDate: dt(-6), monthlyRent: 1400, depositAmount: 2800, status: LeaseStatus.ENDED, signedAt: dt(-18) },
    }),
    prisma.lease.upsert({
      where: { id: 'lease-5' },
      update: {},
      create: { id: 'lease-5', unitId: u8.id, tenantId: ten5.id, propertyId: prop3.id, startDate: dt(-1), endDate: dt(11), monthlyRent: 2400, depositAmount: 4800, status: LeaseStatus.ACTIVE, signedAt: dt(-1) },
    }),
  ])

  // ── LedgerEntries ────────────────────────────────────────────────
  const makeEntry = (id: string, leaseId: string, propertyId: string, type: LedgerEntryType, amount: number, monthsAgo: number, memo?: string) => {
    const d = new Date(now)
    d.setMonth(d.getMonth() - monthsAgo)
    d.setDate(1)
    return prisma.ledgerEntry.upsert({
      where: { id },
      update: {},
      create: { id, leaseId, propertyId, type, amount, currency: 'USD', effectiveDate: d, memo: memo ?? null },
    })
  }

  await Promise.all([
    makeEntry('led-1-1', l1.id, prop1.id, LedgerEntryType.RENT, 1200, 3, 'Jan rent'),
    makeEntry('led-1-2', l1.id, prop1.id, LedgerEntryType.RENT, 1200, 2, 'Feb rent'),
    makeEntry('led-1-3', l1.id, prop1.id, LedgerEntryType.RENT, 1200, 1, 'Mar rent'),
    makeEntry('led-1-4', l1.id, prop1.id, LedgerEntryType.RENT, 1200, 0, 'Apr rent'),
    makeEntry('led-2-1', l2.id, prop1.id, LedgerEntryType.RENT, 1650, 2, 'Feb rent'),
    makeEntry('led-2-2', l2.id, prop1.id, LedgerEntryType.RENT, 1650, 1, 'Mar rent'),
    makeEntry('led-2-3', l2.id, prop1.id, LedgerEntryType.LATE_FEE, 75, 1, 'Late payment fee'),
    makeEntry('led-2-4', l2.id, prop1.id, LedgerEntryType.RENT, 1650, 0, 'Apr rent'),
    makeEntry('led-5-1', l5.id, prop3.id, LedgerEntryType.DEPOSIT, 4800, 1, 'Security deposit'),
    makeEntry('led-5-2', l5.id, prop3.id, LedgerEntryType.RENT, 2400, 0, 'Apr rent'),
    // Expense entry
    makeEntry('led-exp-1', l1.id, prop1.id, LedgerEntryType.MAINTENANCE_EXPENSE, -350, 1, 'Plumbing repair'),
  ])

  // ── Vendors ──────────────────────────────────────────────────────
  const [v1, v2, v3] = await Promise.all([
    prisma.vendor.upsert({
      where: { id: 'vendor-plumb' },
      update: {},
      create: { id: 'vendor-plumb', name: 'Austin Plumbing Co', email: 'info@austinplumbing.com', phone: '512-555-1001', serviceCategories: [WorkOrderCategory.PLUMBING], status: VendorStatus.ACTIVE },
    }),
    prisma.vendor.upsert({
      where: { id: 'vendor-hvac' },
      update: {},
      create: { id: 'vendor-hvac', name: 'Cool Air HVAC', email: 'service@coolair.com', phone: '512-555-2001', serviceCategories: [WorkOrderCategory.HVAC, WorkOrderCategory.ELECTRICAL], status: VendorStatus.ACTIVE },
    }),
    prisma.vendor.upsert({
      where: { id: 'vendor-gen' },
      update: {},
      create: { id: 'vendor-gen', name: 'Handy Pro Services', email: 'jobs@handypro.com', phone: '512-555-3001', serviceCategories: [WorkOrderCategory.GENERAL, WorkOrderCategory.TURNOVER], status: VendorStatus.ACTIVE },
    }),
  ])

  // Link vendors to properties
  await Promise.all([
    prisma.propertyVendor.upsert({ where: { propertyId_vendorId: { propertyId: prop1.id, vendorId: v1.id } }, update: {}, create: { propertyId: prop1.id, vendorId: v1.id } }),
    prisma.propertyVendor.upsert({ where: { propertyId_vendorId: { propertyId: prop1.id, vendorId: v2.id } }, update: {}, create: { propertyId: prop1.id, vendorId: v2.id } }),
    prisma.propertyVendor.upsert({ where: { propertyId_vendorId: { propertyId: prop2.id, vendorId: v2.id } }, update: {}, create: { propertyId: prop2.id, vendorId: v2.id } }),
    prisma.propertyVendor.upsert({ where: { propertyId_vendorId: { propertyId: prop1.id, vendorId: v3.id } }, update: {}, create: { propertyId: prop1.id, vendorId: v3.id } }),
  ])

  // ── WorkOrders ───────────────────────────────────────────────────
  const [wo1, wo2, wo3, wo4, wo5] = await Promise.all([
    prisma.workOrder.upsert({
      where: { id: 'wo-1' },
      update: {},
      create: { id: 'wo-1', propertyId: prop1.id, unitId: u1.id, submittedById: t1User.id, title: 'Leaking faucet in bathroom', description: 'The bathroom faucet has been dripping for a week.', category: WorkOrderCategory.PLUMBING, priority: WorkOrderPriority.MEDIUM, status: WorkOrderStatus.NEW },
    }),
    prisma.workOrder.upsert({
      where: { id: 'wo-2' },
      update: {},
      create: { id: 'wo-2', propertyId: prop1.id, unitId: u2.id, submittedById: t2User.id, title: 'HVAC not cooling', description: 'AC unit is running but not cooling the apartment.', category: WorkOrderCategory.HVAC, priority: WorkOrderPriority.HIGH, status: WorkOrderStatus.ASSIGNED, assignedVendorId: v2.id },
    }),
    prisma.workOrder.upsert({
      where: { id: 'wo-3' },
      update: {},
      create: { id: 'wo-3', propertyId: prop1.id, unitId: u4.id, submittedById: manager1.id, title: 'Water damage — ceiling', description: 'Significant water stain on bedroom ceiling, possible pipe leak.', category: WorkOrderCategory.PLUMBING, priority: WorkOrderPriority.EMERGENCY, status: WorkOrderStatus.IN_PROGRESS, assignedVendorId: v1.id },
    }),
    prisma.workOrder.upsert({
      where: { id: 'wo-4' },
      update: {},
      create: { id: 'wo-4', propertyId: prop2.id, unitId: u5.id, submittedById: t3User.id, title: 'Garbage disposal broken', description: 'Disposal unit jammed and will not turn on.', category: WorkOrderCategory.GENERAL, priority: WorkOrderPriority.LOW, status: WorkOrderStatus.COMPLETED, assignedVendorId: v3.id, completedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) },
    }),
    prisma.workOrder.upsert({
      where: { id: 'wo-5' },
      update: {},
      create: { id: 'wo-5', propertyId: prop2.id, unitId: u6.id, submittedById: t4User.id, title: 'Broken window lock', description: 'Bedroom window latch is broken, security concern.', category: WorkOrderCategory.GENERAL, priority: WorkOrderPriority.HIGH, status: WorkOrderStatus.NEW },
    }),
  ])

  // ── WorkOrderCosts ───────────────────────────────────────────────
  await Promise.all([
    prisma.workOrderCost.upsert({
      where: { id: 'woc-1' },
      update: {},
      create: { id: 'woc-1', workOrderId: wo3.id, costType: WorkOrderCostType.LABOR, amount: 250, memo: '3 hours labor' },
    }),
    prisma.workOrderCost.upsert({
      where: { id: 'woc-2' },
      update: {},
      create: { id: 'woc-2', workOrderId: wo4.id, costType: WorkOrderCostType.PARTS, amount: 85, memo: 'Disposal unit replacement' },
    }),
  ])

  // ── AuditLog ─────────────────────────────────────────────────────
  await Promise.all([
    prisma.auditLog.upsert({
      where: { id: 'audit-1' },
      update: {},
      create: { id: 'audit-1', actorUserId: admin.id, action: AuditAction.CREATE, entityType: 'Property', entityId: prop1.id, diff: { name: 'Sunset Apartments' } },
    }),
    prisma.auditLog.upsert({
      where: { id: 'audit-2' },
      update: {},
      create: { id: 'audit-2', actorUserId: manager1.id, action: AuditAction.CREATE, entityType: 'Lease', entityId: l1.id, diff: { status: 'ACTIVE' } },
    }),
    prisma.auditLog.upsert({
      where: { id: 'audit-3' },
      update: {},
      create: { id: 'audit-3', actorUserId: manager1.id, action: AuditAction.STATUS_CHANGE, entityType: 'WorkOrder', entityId: wo2.id, diff: { before: { status: 'NEW' }, after: { status: 'ASSIGNED' } } },
    }),
    prisma.auditLog.upsert({
      where: { id: 'audit-4' },
      update: {},
      create: { id: 'audit-4', actorUserId: manager2.id, action: AuditAction.STATUS_CHANGE, entityType: 'WorkOrder', entityId: wo4.id, diff: { before: { status: 'IN_PROGRESS' }, after: { status: 'COMPLETED' } } },
    }),
    prisma.auditLog.upsert({
      where: { id: 'audit-5' },
      update: {},
      create: { id: 'audit-5', actorUserId: admin.id, action: AuditAction.CREATE, entityType: 'Vendor', entityId: v1.id, diff: { name: 'Austin Plumbing Co' } },
    }),
  ])

  console.log('✅ Seed complete!')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
