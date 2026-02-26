'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, ChevronRight, Shield, Wrench, Home, LogOut } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { formatDate } from '@/lib/utils'

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  ADMIN: { label: 'Administrator', color: 'bg-red-100 text-red-700', icon: <Shield className="h-5 w-5" /> },
  MANAGER: { label: 'Property Manager', color: 'bg-blue-100 text-blue-700', icon: <Building2 className="h-5 w-5" /> },
  TENANT: { label: 'Tenant', color: 'bg-green-100 text-green-700', icon: <Home className="h-5 w-5" /> },
}

export default function OrgSelectPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(data => {
        if (data.error) { router.push('/login'); return }
        setProfile(data)
        setLoading(false)
      })
      .catch(() => router.push('/login'))
  }, [router])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
    </div>
  )

  const roleConf = ROLE_CONFIG[profile?.systemRole] ?? ROLE_CONFIG.TENANT

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 bg-blue-600 rounded-2xl mb-4">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="text-gray-500 mt-1">{profile?.name}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Role badge */}
          <div className="px-6 py-4 border-b border-gray-100">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${roleConf.color}`}>
              {roleConf.icon}
              {roleConf.label}
            </div>
          </div>

          {/* Org info */}
          {profile?.org ? (
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Organization</p>
              <p className="font-semibold text-gray-900">{profile.org.name}</p>
              <p className="text-sm text-gray-500">{profile.org.type} · {profile.org.status}</p>
            </div>
          ) : (
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Organization</p>
              <p className="text-sm text-gray-400 italic">No organization assigned</p>
            </div>
          )}

          {/* Scope summary */}
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Access Scope</p>
            {profile?.systemRole === 'ADMIN' && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Shield className="h-4 w-4 text-red-500" />
                Full portfolio access across all properties
              </div>
            )}
            {profile?.systemRole === 'MANAGER' && (
              <>
                {profile.managedProperties?.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-sm text-gray-500 mb-2">{profile.managedProperties.length} propert{profile.managedProperties.length !== 1 ? 'ies' : 'y'}</p>
                    {profile.managedProperties.slice(0, 4).map((p: any) => (
                      <div key={p.id} className="flex items-center gap-2 text-sm text-gray-700">
                        <Building2 className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                        {p.name} — {p.city}, {p.state}
                      </div>
                    ))}
                    {profile.managedProperties.length > 4 && (
                      <p className="text-xs text-gray-400">…and {profile.managedProperties.length - 4} more</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No properties assigned yet</p>
                )}
              </>
            )}
            {profile?.systemRole === 'TENANT' && (
              <>
                {profile.tenant?.leases?.[0] ? (
                  <div className="space-y-1 text-sm text-gray-700">
                    <div className="flex items-center gap-2">
                      <Home className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                      {profile.tenant.property?.name} — Unit {profile.tenant.leases[0].unit?.unitNumber}
                    </div>
                    <p className="text-xs text-gray-400">Lease ends: {formatDate(profile.tenant.leases[0].endDate)}</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No active lease</p>
                )}
              </>
            )}
          </div>

          {/* CTA */}
          <div className="px-6 py-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full flex items-center justify-between bg-blue-600 text-white px-5 py-3 rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors"
            >
              <span>Continue to Dashboard</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors mx-auto mt-5"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  )
}
