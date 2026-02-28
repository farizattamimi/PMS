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
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} branding={branding} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
      {isTenant && <TenantChatWidget />}
    </div>
  )
}
