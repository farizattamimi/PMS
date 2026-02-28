'use client'

import { signOut, useSession } from 'next-auth/react'
import { Bell, LogOut, Menu, User, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
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
    const interval = setInterval(loadNotifications, 30000) // poll every 30s
    return () => clearInterval(interval)
  }, [])

  // Close panel when clicking outside
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

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-2">
        {/* Hamburger — mobile only */}
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <div className="flex-1" />
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Role badge */}
        {session?.user?.systemRole && (
          <Badge variant={
            session.user.systemRole === 'ADMIN' ? 'danger' :
            session.user.systemRole === 'MANAGER' ? 'info' : 'success'
          }>
            {session.user.systemRole}
          </Badge>
        )}

        {/* Notification bell */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setShowPanel(v => !v)}
            className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 h-4 w-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showPanel && (
            <div className="absolute right-0 top-12 max-w-[calc(100vw-2rem)] sm:w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="font-semibold text-sm text-gray-900">Notifications</span>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline">
                      Mark all read
                    </button>
                  )}
                  <button onClick={() => setShowPanel(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                {notifications.length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-8">No notifications</p>
                )}
                {notifications.map(n => (
                  <div
                    key={n.id}
                    className={`px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors ${!n.read ? 'bg-blue-50/50' : ''}`}
                    onClick={() => markRead(n.id)}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-lg flex-shrink-0">{TYPE_ICON[n.type] ?? '🔔'}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!n.read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{n.title}</p>
                        {n.body && <p className="text-xs text-gray-500 mt-0.5 truncate">{n.body}</p>}
                        <p className="text-xs text-gray-400 mt-1">{formatDate(n.createdAt)}</p>
                      </div>
                      {!n.read && <div className="h-2 w-2 bg-blue-500 rounded-full mt-1 flex-shrink-0" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User info */}
        <div className="flex items-center gap-2 text-sm">
          <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
            <User className="h-4 w-4 text-blue-600" />
          </div>
          <span className="font-medium text-gray-700 hidden sm:block">
            {session?.user?.name ?? session?.user?.email}
          </span>
        </div>

        {/* Sign out */}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
