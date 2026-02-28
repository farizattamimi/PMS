'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Building2,
  Wrench,
  Users2,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  FileText,
  CreditCard,
  AlertTriangle,
  MessageSquare,
  ShieldCheck,
  ClipboardCheck,
  Bot,
  Settings2,
  Activity,
  AlertOctagon,
  Gauge,
  CalendarDays,
  BellRing,
  HardHat,
  Bell,
  Banknote,
  ScrollText,
  Shield,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  roles?: string[]
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/properties', label: 'Properties', icon: Building2, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/workorders', label: 'Work Orders', icon: Wrench, roles: ['ADMIN', 'MANAGER', 'TENANT'] },
  { href: '/dashboard/vendors', label: 'Vendors', icon: Users2, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/applications', label: 'Applications', icon: FileText, roles: ['ADMIN', 'MANAGER', 'TENANT'] },
  { href: '/dashboard/incidents', label: 'Incidents', icon: AlertTriangle, roles: ['ADMIN', 'MANAGER', 'TENANT'] },
  { href: '/dashboard/inspections', label: 'Inspections', icon: ClipboardCheck, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/compliance', label: 'Compliance', icon: ShieldCheck, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/messages', label: 'Messages', icon: MessageSquare, roles: ['ADMIN', 'MANAGER', 'TENANT'] },
  { href: '/dashboard/calendar',     label: 'Calendar',     icon: CalendarDays, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/bulk-notify',  label: 'Bulk Notify',  icon: BellRing,     roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/reporting', label: 'Reporting', icon: BarChart3, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/agent-inbox',      label: 'Agent Inbox',      icon: Bot,          roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/agent-runs',       label: 'Agent Runs',       icon: Activity,     roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/agent-exceptions', label: 'Exceptions',       icon: AlertOctagon, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/agent-kpis',       label: 'KPI Dashboard',    icon: Gauge,        roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/agent-settings',   label: 'Agent Settings',   icon: Settings2,    roles: ['ADMIN'] },
  { href: '/dashboard/notification-preferences', label: 'Preferences', icon: Bell, roles: ['ADMIN', 'MANAGER', 'TENANT', 'VENDOR'] },
  { href: '/dashboard/distributions', label: 'Distributions', icon: Banknote, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/admin/audit-log', label: 'Audit Log', icon: ScrollText, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/settings/security', label: 'Security', icon: Shield, roles: ['ADMIN', 'MANAGER', 'TENANT', 'VENDOR', 'OWNER'] },
  { href: '/dashboard/admin', label: 'Admin', icon: Settings, roles: ['ADMIN'] },
  // Owner-only
  { href: '/dashboard/owner-portal', label: 'My Properties', icon: Building2, roles: ['OWNER'] },
  { href: '/dashboard/owner-portal/distributions', label: 'Distributions', icon: Banknote, roles: ['OWNER'] },
  // Vendor-only
  { href: '/dashboard/vendor-portal',              label: 'My Work Orders', icon: HardHat,  roles: ['VENDOR'] },
  { href: '/dashboard/vendor-portal/profile',      label: 'My Profile',     icon: Settings2, roles: ['VENDOR'] },
  // Tenant-only
  { href: '/dashboard/my-lease', label: 'My Lease', icon: FileText, roles: ['TENANT'] },
  { href: '/dashboard/my-payments', label: 'My Payments', icon: CreditCard, roles: ['TENANT'] },
  { href: '/dashboard/my-maintenance', label: 'My Maintenance', icon: Wrench, roles: ['TENANT'] },
  { href: '/dashboard/my-onboarding', label: 'My Onboarding', icon: ClipboardCheck, roles: ['TENANT'] },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  branding?: { name?: string; logoUrl?: string; primaryColor?: string }
  onNavClick?: () => void
}

export function Sidebar({ collapsed, onToggle, branding, onNavClick }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const role = session?.user?.systemRole

  const visibleItems = navItems.filter(
    item => !item.roles || !role || item.roles.includes(role)
  )

  return (
    <aside
      className={cn(
        'relative flex flex-col bg-gray-900 text-white transition-all duration-300 ease-in-out h-screen sticky top-0',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-gray-700">
        {branding?.logoUrl ? (
          <img src={branding.logoUrl} alt={branding.name ?? 'Logo'} className={collapsed ? 'h-7 mx-auto' : 'h-8'} />
        ) : !collapsed ? (
          <span className="text-lg font-bold tracking-tight">
            <span style={{ color: 'var(--org-primary, #60a5fa)' }}>{branding?.name ?? 'PMS'}</span>
          </span>
        ) : (
          <span className="text-lg font-bold mx-auto" style={{ color: 'var(--org-primary, #60a5fa)' }}>{(branding?.name ?? 'P')[0]}</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavClick}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors text-sm font-medium',
                isActive
                  ? 'text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
              style={isActive ? { backgroundColor: 'var(--org-primary, #2563eb)' } : undefined}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Collapse toggle — hidden on mobile */}
      <button
        onClick={onToggle}
        className="hidden md:block absolute -right-3 top-20 bg-gray-900 border border-gray-700 rounded-full p-1 text-gray-400 hover:text-white transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>
    </aside>
  )
}
