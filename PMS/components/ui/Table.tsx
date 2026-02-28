import { cn } from '@/lib/utils'
import { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react'

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table
        className={cn('min-w-full', className)}
        style={{ borderCollapse: 'collapse' }}
        {...props}
      />
    </div>
  )
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(className)}
      style={{ borderBottom: '1px solid var(--border)' }}
      {...props}
    />
  )
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn(className)} {...props} />
}

export function TableRow({ className, style, onMouseEnter, onMouseLeave, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('transition-colors', className)}
      style={{ borderBottom: '1px solid var(--border)', ...style }}
      onMouseEnter={e => {
        ;(e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'
        onMouseEnter?.(e)
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLElement).style.background = 'transparent'
        onMouseLeave?.(e)
      }}
      {...props}
    />
  )
}

export function TableHeader({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.09em]',
        className
      )}
      style={{ color: 'var(--text-muted)' }}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn('px-5 py-3.5 whitespace-nowrap text-[12px]', className)}
      style={{ color: 'var(--text-primary)' }}
      {...props}
    />
  )
}

interface EmptyStateProps {
  message?: string
  colSpan?: number
}

export function TableEmptyState({ message = 'No data found', colSpan = 99 }: EmptyStateProps) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-5 py-10 text-center text-[12px]"
        style={{ color: 'var(--text-muted)' }}
      >
        {message}
      </td>
    </tr>
  )
}
