import { SystemRole, Permission } from '@prisma/client'

export const ROLE_PERMISSIONS: Record<SystemRole, Permission[]> = {
  ADMIN: [
    Permission.PROPERTIES_READ,
    Permission.PROPERTIES_WRITE,
    Permission.UNITS_READ,
    Permission.UNITS_WRITE,
    Permission.TENANTS_READ,
    Permission.TENANTS_WRITE,
    Permission.LEASES_READ,
    Permission.LEASES_WRITE,
    Permission.LEDGER_READ,
    Permission.LEDGER_WRITE,
    Permission.WORKORDERS_READ,
    Permission.WORKORDERS_WRITE,
    Permission.VENDORS_READ,
    Permission.VENDORS_WRITE,
    Permission.AUDIT_READ,
    Permission.REPORTS_READ,
    Permission.ADMIN_READ,
  ],
  MANAGER: [
    Permission.PROPERTIES_READ,
    Permission.PROPERTIES_WRITE,
    Permission.UNITS_READ,
    Permission.UNITS_WRITE,
    Permission.TENANTS_READ,
    Permission.TENANTS_WRITE,
    Permission.LEASES_READ,
    Permission.LEASES_WRITE,
    Permission.LEDGER_READ,
    Permission.LEDGER_WRITE,
    Permission.WORKORDERS_READ,
    Permission.WORKORDERS_WRITE,
    Permission.VENDORS_READ,
    Permission.VENDORS_WRITE,
    Permission.REPORTS_READ,
  ],
  TENANT: [
    Permission.WORKORDERS_READ,
    Permission.WORKORDERS_WRITE,
    Permission.LEASES_READ,
    Permission.LEDGER_READ,
  ],
}

export function hasPermission(role: SystemRole, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false
}
