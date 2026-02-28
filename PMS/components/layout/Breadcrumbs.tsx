'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'

// Human-readable labels for known route segments
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  properties: 'Properties',
  workorders: 'Work Orders',
  vendors: 'Vendors',
  applications: 'Applications',
  incidents: 'Incidents',
  inspections: 'Inspections',
  compliance: 'Compliance',
  messages: 'Messages',
  calendar: 'Calendar',
  'bulk-notify': 'Bulk Notify',
  reporting: 'Reporting',
  tenants: 'Tenants',
  'agent-inbox': 'Agent Inbox',
  'agent-runs': 'Agent Runs',
  'agent-exceptions': 'Exceptions',
  'agent-kpis': 'KPI Dashboard',
  'agent-settings': 'Agent Settings',
  distributions: 'Distributions',
  'notification-preferences': 'Preferences',
  admin: 'Admin',
  'audit-log': 'Audit Log',
  settings: 'Settings',
  security: 'Security',
  'vendor-portal': 'Vendor Portal',
  'owner-portal': 'Owner Portal',
  'my-lease': 'My Lease',
  'my-payments': 'My Payments',
  'my-maintenance': 'My Maintenance',
  'my-onboarding': 'My Onboarding',
  'bulk-create': 'Bulk Create',
  profile: 'Profile',
  new: 'New',
  edit: 'Edit',
}

// Segments that look like IDs (UUIDs or cuid-style) — show as "Detail"
function isIdSegment(segment: string) {
  return /^[a-z0-9]{20,}$/i.test(segment) || /^[0-9a-f-]{32,}$/i.test(segment)
}

interface BreadcrumbItem {
  label: string
  href: string
}

interface BreadcrumbsProps {
  /** Optional overrides: pass e.g. [{ label: 'Oakwood Apartments', href: '/dashboard/properties/abc123' }] for entity names */
  overrides?: BreadcrumbItem[]
  className?: string
}

export function Breadcrumbs({ overrides, className }: BreadcrumbsProps) {
  const pathname = usePathname()

  // Build crumbs from pathname, starting after /dashboard
  const segments = pathname.split('/').filter(Boolean) // e.g. ['dashboard', 'properties', 'abc123']

  const crumbs: BreadcrumbItem[] = []
  let accPath = ''
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    accPath += '/' + seg

    // Skip the root "dashboard" segment — we're already there
    if (seg === 'dashboard') continue

    const label = SEGMENT_LABELS[seg] ?? (isIdSegment(seg) ? '…' : seg)
    crumbs.push({ label, href: accPath })
  }

  // Apply overrides: replace matching hrefs with custom labels
  const finalCrumbs = crumbs.map(crumb => {
    const override = overrides?.find(o => o.href === crumb.href)
    return override ?? crumb
  })

  // Don't show breadcrumbs if we're at the top level (only 0–1 crumbs)
  if (finalCrumbs.length <= 1) return null

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center gap-1 mb-2 ${className ?? ''}`}
    >
      {finalCrumbs.map((crumb, i) => {
        const isLast = i === finalCrumbs.length - 1
        return (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
            )}
            {isLast ? (
              <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="text-[11px] font-medium transition-colors hover:opacity-100"
                style={{ color: 'var(--text-muted)', opacity: 0.7 }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--accent-amber)'}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
                  ;(e.currentTarget as HTMLElement).style.opacity = '0.7'
                }}
              >
                {crumb.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
