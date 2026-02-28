'use client'

import { signOut, useSession } from 'next-auth/react'
import { Bell, LogOut, Menu, X } from 'lucide-react'
import { CommandPaletteTrigger } from '@/components/layout/CommandPalette'
import { useEffect, useRef, useState } from 'react'
import { formatDate } from '@/lib/utils'

interface TopbarProps {
  onMenuClick?: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { data: session } = useSession()
  const [notifications, setNotifications] = useState<any[]>([])
  const [showPanel, setShowPanel] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter(n => !n.read).length

  async function loadNotifications() {
    const res = await fetch('/api/notifications')
    if (res.ok) setNotifications(await res.json())
  }

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowPanel(false)
      }
    }
    if (showPanel) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPanel])

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH' })
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' })
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  const TYPE_ICON: Record<string, string> = {
    WO_STATUS: '🔧',
    LEASE_EXPIRING: '📅',
    PAYMENT_DUE: '💳',
    GENERAL: '🔔',
  }

  const roleStyle = (role?: string) => {
    if (role === 'ADMIN')   return { bg: 'var(--accent-red-muted)',    color: 'var(--accent-red)',    border: 'rgba(255,77,106,0.22)' }
    if (role === 'MANAGER') return { bg: 'var(--accent-blue-muted)',   color: 'var(--accent-blue)',   border: 'rgba(79,142,247,0.22)' }
    return                         { bg: 'var(--accent-green-muted)',  color: 'var(--accent-green)',  border: 'rgba(16,227,165,0.22)' }
  }

  const role = session?.user?.systemRole
  const rs = roleStyle(role)
  const userName = session?.user?.name ?? session?.user?.email ?? ''
  const initials = userName.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'

  return (
    <header
      className="h-14 flex items-center justify-between px-4 sm:px-6 flex-shrink-0"
      style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
    >
      {/* Left — mobile hamburger */}
      <div className="flex items-center">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Open menu"
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Right — search, role badge, notifications, user, sign-out */}
      <div className="flex items-center gap-2 sm:gap-3">
        <CommandPaletteTrigger />
        {/* Role badge */}
        {role && (
          <span
            className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest badge"
            data-compact
            style={{ background: rs.bg, color: rs.color, border: `1px solid ${rs.border}` }}
          >
            {role}
          </span>
        )}

        {/* Notification bell */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setShowPanel(v => !v)}
            className="relative p-2 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            title="Notifications"
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
          >
            <Bell className="h-[18px] w-[18px]" />
            {unreadCount > 0 && (
              <span
                className="absolute top-1.5 right-1.5 h-[14px] w-[14px] flex items-center justify-center rounded-full text-white font-bold pulse-ring badge"
                data-compact
                style={{ background: 'var(--accent-red)', fontSize: '8px', lineHeight: 1 }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showPanel && (
            <div
              className="absolute right-0 top-11 w-[320px] rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in-up"
              style={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--border-strong)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              }}
            >
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Notifications
                  {unreadCount > 0 && (
                    <span
                      className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold"
                      style={{ background: 'var(--accent-amber-muted)', color: 'var(--accent-amber)' }}
                    >
                      {unreadCount} new
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-[11px] font-medium transition-colors"
                      style={{ color: 'var(--accent-amber)' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.7'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                    >
                      Mark all read
                    </button>
                  )}
                  <button onClick={() => setShowPanel(false)} style={{ color: 'var(--text-muted)' }}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="max-h-[320px] overflow-y-auto">
                {notifications.length === 0 && (
                  <p className="text-center text-[13px] py-10" style={{ color: 'var(--text-muted)' }}>
                    All caught up ✓
                  </p>
                )}
                {notifications.map((n, idx) => (
                  <div
                    key={n.id}
                    className="px-4 py-3 cursor-pointer transition-colors"
                    style={{
                      borderBottom: idx < notifications.length - 1 ? '1px solid var(--border)' : 'none',
                      background: !n.read ? 'var(--accent-amber-muted)' : 'transparent',
                    }}
                    onClick={() => markRead(n.id)}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = !n.read ? 'var(--accent-amber-muted)' : 'transparent'}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-sm flex-shrink-0 mt-0.5">{TYPE_ICON[n.type] ?? '🔔'}</span>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-[12px] font-medium truncate leading-snug"
                          style={{ color: !n.read ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                        >
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                            {n.body}
                          </p>
                        )}
                        <p className="text-[10px] mt-1 font-data" style={{ color: 'var(--text-muted)' }}>
                          {formatDate(n.createdAt)}
                        </p>
                      </div>
                      {!n.read && (
                        <div
                          className="h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0"
                          style={{ background: 'var(--accent-amber)' }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User avatar + name */}
        <div className="flex items-center gap-2">
          <div
            className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
            style={{
              background: 'var(--accent-amber-muted)',
              color: 'var(--accent-amber)',
              border: '1px solid rgba(245,158,11,0.25)',
            }}
          >
            {initials}
          </div>
          <span
            className="text-[12px] font-medium hidden sm:block truncate max-w-[120px]"
            style={{ color: 'var(--text-secondary)' }}
          >
            {userName}
          </span>
        </div>

        {/* Sign out */}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="p-2 rounded-lg transition-colors"
          style={{ color: 'var(--text-muted)' }}
          title="Sign out"
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--accent-red)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
