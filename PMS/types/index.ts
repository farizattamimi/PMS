import { SystemRole, UnitStatus, LeaseStatus, WorkOrderPriority, WorkOrderStatus, WorkOrderCategory, LedgerEntryType, TenantStatus, PropertyStatus } from '@prisma/client'

export type { SystemRole, UnitStatus, LeaseStatus, WorkOrderPriority, WorkOrderStatus, WorkOrderCategory, LedgerEntryType, TenantStatus, PropertyStatus }

export interface DashboardStats {
  totalUnits: number
  occupiedUnits: number
  occupancyRate: number
  openWorkOrders: number
  expiringLeases30: number
  expiringLeases60: number
}

export interface PropertyWithStats {
  id: string
  name: string
  address: string
  city: string
  state: string
  zip: string
  status: PropertyStatus
  totalUnits: number
  occupiedUnits: number
  occupancyRate: number
  openWorkOrders: number
}

export interface UnitWithDetails {
  id: string
  propertyId: string
  propertyName: string
  unitNumber: string
  bedrooms: number
  bathrooms: number
  sqFt: number
  monthlyRent: number
  status: UnitStatus
  currentTenant?: string
  leaseEnd?: Date
}

export interface TenantWithDetails {
  id: string
  name: string
  email: string
  phone: string
  status: TenantStatus
  unit?: string
  property?: string
  leaseStatus?: LeaseStatus
}

export interface LeaseWithDetails {
  id: string
  unitNumber: string
  propertyName: string
  tenantName: string
  startDate: Date
  endDate: Date
  monthlyRent: number
  depositAmount: number
  status: LeaseStatus
  daysUntilExpiry: number
}

export interface LedgerEntryWithDetails {
  id: string
  tenantName?: string
  unitNumber?: string
  propertyName?: string
  amount: number
  type: LedgerEntryType
  effectiveDate: Date
  memo?: string
}

export interface WorkOrderWithDetails {
  id: string
  title: string
  description: string
  propertyName: string
  unitNumber?: string
  submittedByName: string
  assignedVendorName?: string
  category: WorkOrderCategory
  priority: WorkOrderPriority
  status: WorkOrderStatus
  createdAt: Date
  updatedAt: Date
  completedAt?: Date
}
