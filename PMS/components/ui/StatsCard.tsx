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
  className?: string
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = 'text-blue-600',
  iconBg = 'bg-blue-50',
  trend,
  className,
}: StatsCardProps) {
  return (
    <div className={cn('bg-white rounded-xl shadow-sm border border-gray-200 p-6', className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          )}
          {trend && (
            <p className={cn('mt-2 text-xs font-medium', trend.positive ? 'text-green-600' : 'text-red-600')}>
              {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}% from last month
            </p>
          )}
        </div>
        <div className={cn('p-3 rounded-lg', iconBg)}>
          <Icon className={cn('h-6 w-6', iconColor)} />
        </div>
      </div>
    </div>
  )
}
