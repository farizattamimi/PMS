'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { navItems, GROUP_LABELS, GROUP_ORDER } from '@/lib/nav-items'

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

  const grouped = GROUP_ORDER.reduce<Record<string, typeof navItems>>((acc, key) => {
    const items = visibleItems.filter(i => (i.group ?? 'main') === key)
    if (items.length) acc[key] = items
    return acc
  }, {})

  const orgLetter = (branding?.name ?? 'P')[0].toUpperCase()

  return (
    <aside
      className={cn(
        'relative flex flex-col h-screen sticky top-0 transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0',
        collapsed ? 'w-[60px]' : 'w-[220px]'
      )}
      style={{
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* ── Logo ──────────────────────────────────────────────────────── */}
      <div
        className="flex items-center h-14 px-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {collapsed ? (
          <div
            className="mx-auto w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--accent-amber-muted)' }}
          >
            <span className="text-sm font-bold font-display" style={{ color: 'var(--accent-amber)' }}>
              {orgLetter}
            </span>
          </div>
        ) : branding?.logoUrl ? (
          <img src={branding.logoUrl} alt={branding.name ?? 'Logo'} className="h-7 object-contain" />
        ) : (
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--accent-amber-muted)' }}
            >
              <span className="text-xs font-bold" style={{ color: 'var(--accent-amber)' }}>
                {orgLetter}
              </span>
            </div>
            <span
              className="text-[13px] font-semibold font-display truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {branding?.name ?? 'PropManager'}
            </span>
          </div>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-2">
        {GROUP_ORDER.map(groupKey => {
          const items = grouped[groupKey]
          if (!items) return null
          return (
            <div key={groupKey} className="mb-0.5">
              {!collapsed && (
                <p
                  className="px-4 pt-4 pb-1 text-[9px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {GROUP_LABELS[groupKey]}
                </p>
              )}
              {collapsed && groupKey !== 'main' && (
                <div
                  className="mx-3 my-2 h-px"
                  style={{ background: 'var(--border)' }}
                />
              )}
              {items.map(item => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavClick}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'relative flex items-center gap-2.5 mx-2 px-2.5 py-2 rounded-lg transition-all duration-150 text-[12px] font-medium leading-none',
                      isActive ? 'nav-active' : ''
                    )}
                    style={{
                      color: isActive ? 'var(--accent-amber)' : 'var(--text-secondary)',
                      background: isActive ? 'var(--accent-amber-muted)' : 'transparent',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        ;(e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'
                        ;(e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                        ;(e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'
                      }
                    }}
                  >
                    <item.icon className="h-[15px] w-[15px] flex-shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* ── Collapse toggle ───────────────────────────────────────────── */}
      <button
        onClick={onToggle}
        className="hidden md:flex absolute -right-3 top-[68px] h-6 w-6 items-center justify-center rounded-full transition-all duration-150 z-10"
        style={{
          background: 'var(--surface-raised)',
          border: '1px solid var(--border-strong)',
          color: 'var(--text-muted)',
        }}
        onMouseEnter={e => {
          ;(e.currentTarget as HTMLElement).style.color = 'var(--accent-amber)'
          ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-amber)'
        }}
        onMouseLeave={e => {
          ;(e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
          ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'
        }}
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>
    </aside>
  )
}
