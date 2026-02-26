import { cn } from '@/lib/utils'
import { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react'

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('min-w-full divide-y divide-gray-200', className)} {...props} />
    </div>
  )
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-gray-50', className)} {...props} />
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('bg-white divide-y divide-gray-200', className)} {...props} />
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('hover:bg-gray-50 transition-colors', className)}
      {...props}
    />
  )
}

export function TableHeader({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider',
        className
      )}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-6 py-4 whitespace-nowrap text-sm text-gray-900', className)} {...props} />
  )
}

interface EmptyStateProps {
  message?: string
  colSpan?: number
}

export function TableEmptyState({ message = 'No data found', colSpan = 99 }: EmptyStateProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-12 text-center text-gray-500">
        {message}
      </td>
    </tr>
  )
}
