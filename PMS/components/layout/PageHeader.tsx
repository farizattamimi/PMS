'use client'

import { Breadcrumbs } from '@/components/layout/Breadcrumbs'

interface BreadcrumbItem {
  label: string
  href: string
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
  /** Name overrides for dynamic segments, e.g. [{ label: 'Oakwood Apts', href: '/dashboard/properties/abc' }] */
  breadcrumbOverrides?: BreadcrumbItem[]
  /** Set false to suppress auto-breadcrumbs on this page */
  showBreadcrumbs?: boolean
}

export function PageHeader({
  title,
  subtitle,
  action,
  breadcrumbOverrides,
  showBreadcrumbs = true,
}: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-7">
      <div>
        {showBreadcrumbs && (
          <Breadcrumbs overrides={breadcrumbOverrides} />
        )}
        <h1
          className="text-[22px] font-bold font-display leading-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
            {subtitle}
          </p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
