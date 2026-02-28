import {
  LayoutDashboard,
  Building2,
  Wrench,
  Users2,
  BarChart3,
  Settings,
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

export interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  roles?: string[]
  group?: string
}

export const navItems: NavItem[] = [
  // ── Shared ──────────────────────────────────────────────────────────────
  { href: '/dashboard',                           label: 'Dashboard',      icon: LayoutDashboard, roles: ['ADMIN', 'MANAGER', 'TENANT', 'VENDOR', 'OWNER'], group: 'main' },
  { href: '/dashboard/properties',                label: 'Properties',     icon: Building2,        roles: ['ADMIN', 'MANAGER'], group: 'main' },
  { href: '/dashboard/workorders',                label: 'Work Orders',    icon: Wrench,           roles: ['ADMIN', 'MANAGER', 'TENANT'], group: 'main' },
  { href: '/dashboard/vendors',                   label: 'Vendors',        icon: Users2,           roles: ['ADMIN', 'MANAGER'], group: 'main' },
  { href: '/dashboard/applications',              label: 'Applications',   icon: FileText,         roles: ['ADMIN', 'MANAGER', 'TENANT'], group: 'main' },
  { href: '/dashboard/incidents',                 label: 'Incidents',      icon: AlertTriangle,    roles: ['ADMIN', 'MANAGER', 'TENANT'], group: 'main' },
  { href: '/dashboard/inspections',               label: 'Inspections',    icon: ClipboardCheck,   roles: ['ADMIN', 'MANAGER'], group: 'main' },
  { href: '/dashboard/compliance',                label: 'Compliance',     icon: ShieldCheck,      roles: ['ADMIN', 'MANAGER'], group: 'main' },
  { href: '/dashboard/messages',                  label: 'Messages',       icon: MessageSquare,    roles: ['ADMIN', 'MANAGER', 'TENANT'], group: 'main' },
  { href: '/dashboard/calendar',                  label: 'Calendar',       icon: CalendarDays,     roles: ['ADMIN', 'MANAGER'], group: 'main' },
  { href: '/dashboard/bulk-notify',               label: 'Bulk Notify',    icon: BellRing,         roles: ['ADMIN', 'MANAGER'], group: 'main' },
  { href: '/dashboard/reporting',                 label: 'Reporting',      icon: BarChart3,        roles: ['ADMIN', 'MANAGER'], group: 'main' },
  // ── AI Agent ────────────────────────────────────────────────────────────
  { href: '/dashboard/agent-inbox',               label: 'Agent Inbox',    icon: Bot,              roles: ['ADMIN', 'MANAGER'], group: 'ai' },
  { href: '/dashboard/agent-runs',                label: 'Agent Runs',     icon: Activity,         roles: ['ADMIN', 'MANAGER'], group: 'ai' },
  { href: '/dashboard/agent-exceptions',          label: 'Exceptions',     icon: AlertOctagon,     roles: ['ADMIN', 'MANAGER'], group: 'ai' },
  { href: '/dashboard/agent-kpis',                label: 'KPI Dashboard',  icon: Gauge,            roles: ['ADMIN', 'MANAGER'], group: 'ai' },
  { href: '/dashboard/agent-settings',            label: 'Agent Settings', icon: Settings2,        roles: ['ADMIN'], group: 'ai' },
  // ── Finance ─────────────────────────────────────────────────────────────
  { href: '/dashboard/distributions',             label: 'Distributions',  icon: Banknote,         roles: ['ADMIN', 'MANAGER'], group: 'finance' },
  // ── Settings ────────────────────────────────────────────────────────────
  { href: '/dashboard/notification-preferences',  label: 'Preferences',    icon: Bell,             roles: ['ADMIN', 'MANAGER', 'TENANT', 'VENDOR'], group: 'settings' },
  { href: '/dashboard/admin/audit-log',           label: 'Audit Log',      icon: ScrollText,       roles: ['ADMIN', 'MANAGER'], group: 'settings' },
  { href: '/dashboard/settings/security',         label: 'Security',       icon: Shield,           roles: ['ADMIN', 'MANAGER', 'TENANT', 'VENDOR', 'OWNER'], group: 'settings' },
  { href: '/dashboard/admin',                     label: 'Admin',          icon: Settings,         roles: ['ADMIN'], group: 'settings' },
  // ── Owner ────────────────────────────────────────────────────────────────
  { href: '/dashboard/owner-portal',                   label: 'My Properties',  icon: Building2,  roles: ['OWNER'], group: 'main' },
  { href: '/dashboard/owner-portal/distributions',     label: 'Distributions',  icon: Banknote,   roles: ['OWNER'], group: 'finance' },
  // ── Vendor ────────────────────────────────────────────────────────────────
  { href: '/dashboard/vendor-portal',              label: 'My Work Orders', icon: HardHat,        roles: ['VENDOR'], group: 'main' },
  { href: '/dashboard/vendor-portal/profile',      label: 'My Profile',     icon: Settings2,      roles: ['VENDOR'], group: 'settings' },
  // ── Tenant ────────────────────────────────────────────────────────────────
  { href: '/dashboard/my-lease',                   label: 'My Lease',       icon: FileText,        roles: ['TENANT'], group: 'main' },
  { href: '/dashboard/my-payments',                label: 'My Payments',    icon: CreditCard,      roles: ['TENANT'], group: 'finance' },
  { href: '/dashboard/my-maintenance',             label: 'My Maintenance', icon: Wrench,          roles: ['TENANT'], group: 'main' },
  { href: '/dashboard/my-onboarding',              label: 'My Onboarding',  icon: ClipboardCheck,  roles: ['TENANT'], group: 'main' },
]

export const GROUP_LABELS: Record<string, string> = {
  main: 'Main',
  ai: 'AI Agent',
  finance: 'Finance',
  settings: 'Settings',
}

export const GROUP_ORDER = ['main', 'ai', 'finance', 'settings']
