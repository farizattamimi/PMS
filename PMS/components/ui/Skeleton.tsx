import { cn } from '@/lib/utils'

// ── Base shimmer bar ─────────────────────────────────────────────────────────
interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={cn('shimmer rounded-md', className)}
      style={{ height: '14px', borderRadius: '6px', ...style }}
    />
  )
}

// ── Skeleton stat card (matches StatsCard shape) ─────────────────────────────
export function SkeletonStatCard() {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <Skeleton className="mb-3 w-1/2" style={{ height: '10px' }} />
      <Skeleton className="mb-2 w-3/4" style={{ height: '28px' }} />
      <Skeleton className="w-1/3" style={{ height: '10px' }} />
    </div>
  )
}

// ── Skeleton 4-column stats grid ─────────────────────────────────────────────
export function SkeletonStatsGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
      {[0, 1, 2, 3].map(i => <SkeletonStatCard key={i} />)}
    </div>
  )
}

// ── Skeleton 3-column stats grid (tenant) ───────────────────────────────────
export function SkeletonStatsGrid3() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
      {[0, 1, 2].map(i => <SkeletonStatCard key={i} />)}
    </div>
  )
}

// ── Skeleton card (generic) ──────────────────────────────────────────────────
interface SkeletonCardProps {
  rows?: number
  className?: string
}

export function SkeletonCard({ rows = 2, className }: SkeletonCardProps) {
  return (
    <div
      className={cn('rounded-xl p-5', className)}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <Skeleton className="mb-4 w-1/3" style={{ height: '13px' }} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton
          key={i}
          className={i < rows - 1 ? 'mb-2' : ''}
          style={{ height: '12px', width: `${70 + ((i * 17) % 25)}%` }}
        />
      ))}
    </div>
  )
}

// ── Skeleton table rows ──────────────────────────────────────────────────────
interface SkeletonTableProps {
  rows?: number
  cols?: number
  className?: string
}

export function SkeletonTable({ rows = 5, cols = 4, className }: SkeletonTableProps) {
  return (
    <div
      className={cn('rounded-xl overflow-hidden', className)}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div
        className="px-5 py-3 flex gap-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} style={{ height: '10px', width: `${60 + (i * 13) % 40}px` }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          className="px-5 py-3.5 flex gap-4"
          style={{ borderBottom: row < rows - 1 ? '1px solid var(--border)' : 'none' }}
        >
          {Array.from({ length: cols }).map((_, col) => (
            <Skeleton
              key={col}
              style={{
                height: '12px',
                width: `${50 + ((row * 7 + col * 19) % 60)}px`,
                opacity: 0.7 - row * 0.08,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Full manager dashboard skeleton ──────────────────────────────────────────
export function ManagerDashboardSkeleton() {
  return (
    <div>
      {/* Page header */}
      <div className="mb-7">
        <Skeleton className="mb-2 w-36" style={{ height: '22px' }} />
        <Skeleton className="w-28" style={{ height: '12px' }} />
      </div>

      {/* Stats grid */}
      <SkeletonStatsGrid />

      {/* AI Insights card */}
      <SkeletonCard rows={3} className="mb-5" />

      {/* Chart card */}
      <div
        className="rounded-xl p-5 mb-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <Skeleton className="mb-5 w-40" style={{ height: '13px' }} />
        <div className="h-48 flex items-end gap-2 px-2">
          {[40, 70, 55, 90, 65, 80, 45, 75, 60, 85, 50, 72].map((h, i) => (
            <div key={i} className="flex-1 shimmer rounded-t-sm" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>

      {/* Properties table */}
      <SkeletonTable rows={4} cols={5} className="mb-5" />

      {/* 2-col bottom tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SkeletonTable rows={4} cols={4} />
        <SkeletonTable rows={4} cols={4} />
      </div>
    </div>
  )
}

// ── Full tenant dashboard skeleton ───────────────────────────────────────────
export function TenantDashboardSkeleton() {
  return (
    <div>
      {/* Page header */}
      <div className="mb-7">
        <Skeleton className="mb-2 w-28" style={{ height: '22px' }} />
        <Skeleton className="w-48" style={{ height: '12px' }} />
      </div>

      {/* Quick action buttons */}
      <div className="flex gap-2.5 mb-6">
        {[120, 140, 110, 130].map((w, i) => (
          <Skeleton key={i} style={{ width: `${w}px`, height: '36px', borderRadius: '8px' }} />
        ))}
      </div>

      {/* 3-col stats */}
      <SkeletonStatsGrid3 />

      {/* Lease card */}
      <SkeletonCard rows={4} className="mb-5" />

      {/* Work orders table */}
      <SkeletonTable rows={4} cols={4} />
    </div>
  )
}

// ── Generic page skeleton (for other pages) ───────────────────────────────────
export function PageSkeleton() {
  return (
    <div>
      <div className="mb-7">
        <Skeleton className="mb-2 w-40" style={{ height: '22px' }} />
        <Skeleton className="w-32" style={{ height: '12px' }} />
      </div>
      <SkeletonTable rows={6} cols={4} />
    </div>
  )
}
