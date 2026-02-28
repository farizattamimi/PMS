'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { TenantChatWidget } from '@/components/layout/TenantChatWidget'

interface OrgBranding {
  name?: string
  logoUrl?: string
  primaryColor?: string
  accentColor?: string
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { data: session } = useSession()
  const isTenant = session?.user?.systemRole === 'TENANT'
  const [branding, setBranding] = useState<OrgBranding>({})

  useEffect(() => {
    fetch('/api/org/settings')
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) setBranding(data)
      })
      .catch(() => {})
  }, [])

  const cssVars: Record<string, string> = {}
  if (branding.primaryColor) cssVars['--org-primary'] = branding.primaryColor
  if (branding.accentColor) cssVars['--org-accent'] = branding.accentColor

  return (
    <div className="flex h-screen bg-gray-50" style={cssVars as React.CSSProperties}>
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} branding={branding} />
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 w-64">
            <Sidebar
              collapsed={false}
              onToggle={() => setMobileOpen(false)}
              branding={branding}
              onNavClick={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
      {isTenant && <TenantChatWidget />}
    </div>
  )
}
