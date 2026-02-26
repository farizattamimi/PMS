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
  { href: '/dashboard/workorders', label: 'Work Orders', icon: Wrench },
  { href: '/dashboard/vendors', label: 'Vendors', icon: Users2, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/applications', label: 'Applications', icon: FileText, roles: ['ADMIN', 'MANAGER', 'TENANT'] },
  { href: '/dashboard/incidents', label: 'Incidents', icon: AlertTriangle, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/inspections', label: 'Inspections', icon: ClipboardCheck, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/compliance', label: 'Compliance', icon: ShieldCheck, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/messages', label: 'Messages', icon: MessageSquare },
  { href: '/dashboard/reporting', label: 'Reporting', icon: BarChart3, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/agent-inbox',      label: 'Agent Inbox',      icon: Bot,          roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/agent-runs',       label: 'Agent Runs',       icon: Activity,     roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/agent-exceptions', label: 'Exceptions',       icon: AlertOctagon, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/agent-settings',   label: 'Agent Settings',   icon: Settings2,    roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/admin', label: 'Admin', icon: Settings, roles: ['ADMIN'] },
  // Tenant-only
  { href: '/dashboard/my-lease', label: 'My Lease', icon: FileText, roles: ['TENANT'] },
  { href: '/dashboard/my-payments', label: 'My Payments', icon: CreditCard, roles: ['TENANT'] },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
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
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight">
            <span className="text-blue-400">PMS</span>
          </span>
        )}
        {collapsed && (
          <span className="text-lg font-bold text-blue-400 mx-auto">P</span>
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
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors text-sm font-medium',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 bg-gray-900 border border-gray-700 rounded-full p-1 text-gray-400 hover:text-white transition-colors"
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
