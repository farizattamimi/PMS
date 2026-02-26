import { cn } from '@/lib/utils'
import { HTMLAttributes } from 'react'

type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple'
  | 'gray'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        {
          'bg-gray-100 text-gray-800': variant === 'default',
          'bg-green-100 text-green-800': variant === 'success',
          'bg-yellow-100 text-yellow-800': variant === 'warning',
          'bg-red-100 text-red-800': variant === 'danger',
          'bg-blue-100 text-blue-800': variant === 'info',
          'bg-purple-100 text-purple-800': variant === 'purple',
          'bg-gray-100 text-gray-500': variant === 'gray',
        },
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export function UnitStatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeVariant> = {
    AVAILABLE: 'warning',
    OCCUPIED: 'success',
    DOWN: 'danger',
    MODEL: 'purple',
  }
  const label: Record<string, string> = {
    AVAILABLE: 'Available',
    OCCUPIED: 'Occupied',
    DOWN: 'Down',
    MODEL: 'Model',
  }
  return <Badge variant={map[status] ?? 'default'}>{label[status] ?? status}</Badge>
}

export function LeaseStatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeVariant> = {
    DRAFT: 'gray',
    ACTIVE: 'success',
    ENDED: 'warning',
    TERMINATED: 'danger',
  }
  return <Badge variant={map[status] ?? 'default'}>{status}</Badge>
}

export function TenantStatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeVariant> = {
    PROSPECT: 'info',
    ACTIVE: 'success',
    PAST: 'gray',
    EVICTED: 'danger',
  }
  return <Badge variant={map[status] ?? 'default'}>{status}</Badge>
}

export function WorkOrderPriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, BadgeVariant> = {
    LOW: 'info',
    MEDIUM: 'warning',
    HIGH: 'danger',
    EMERGENCY: 'purple',
  }
  return <Badge variant={map[priority] ?? 'default'}>{priority}</Badge>
}

export function WorkOrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeVariant> = {
    NEW: 'warning',
    ASSIGNED: 'info',
    IN_PROGRESS: 'info',
    BLOCKED: 'danger',
    COMPLETED: 'success',
    CANCELED: 'gray',
  }
  return <Badge variant={map[status] ?? 'default'}>{status.replace('_', ' ')}</Badge>
}

export function PropertyStatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeVariant> = {
    ACTIVE: 'success',
    ONBOARDING: 'info',
    OFFBOARDED: 'gray',
  }
  return <Badge variant={map[status] ?? 'default'}>{status}</Badge>
}

// Legacy aliases for backward compat
export const PaymentStatusBadge = ({ status }: { status: string }) => (
  <Badge variant="gray">{status}</Badge>
)
export const MaintenancePriorityBadge = WorkOrderPriorityBadge
export const MaintenanceStatusBadge = WorkOrderStatusBadge
