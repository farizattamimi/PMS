import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  iconColor?: string
  iconBg?: string
  trend?: {
    value: number
    positive: boolean
  }
  accentColor?: string
  className?: string
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = 'text-blue-400',
  iconBg = 'bg-blue-500/10',
  trend,
  accentColor,
  className,
}: StatsCardProps) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-xl p-5 transition-all duration-200', className)}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Top accent stripe */}
      {accentColor && (
        <div
          className="absolute top-0 left-5 right-5 h-[1.5px] rounded-full"
          style={{ background: accentColor, opacity: 0.7 }}
        />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.10em] mb-3"
            style={{ color: 'var(--text-muted)' }}
          >
            {title}
          </p>
          <p
            className="font-data text-[28px] font-medium leading-none tabular-nums mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            {value}
          </p>
          {subtitle && (
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {subtitle}
            </p>
          )}
          {trend && (
            <p
              className="mt-2 text-[11px] font-medium font-data"
              style={{ color: trend.positive ? 'var(--accent-green)' : 'var(--accent-red)' }}
            >
              {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        <div className={cn('p-2.5 rounded-xl flex-shrink-0', iconBg)}>
          <Icon className={cn('h-5 w-5', iconColor)} />
        </div>
      </div>
    </div>
  )
}
