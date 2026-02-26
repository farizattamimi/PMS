'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { TenantChatWidget } from '@/components/layout/TenantChatWidget'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const { data: session } = useSession()
  const isTenant = session?.user?.systemRole === 'TENANT'

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
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
