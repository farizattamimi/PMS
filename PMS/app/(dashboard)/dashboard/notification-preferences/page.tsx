'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'

type Channel = 'IN_APP' | 'EMAIL' | 'SMS'

interface PrefRow {
  notificationType: string
  channel: Channel
  enabled: boolean
}

const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'IN_APP', label: 'In-App' },
  { key: 'EMAIL', label: 'Email' },
  { key: 'SMS', label: 'SMS' },
]

interface NotifType {
  value: string
  label: string
  roles: string[]
}

const NOTIFICATION_TYPES: NotifType[] = [
  { value: 'WO_STATUS', label: 'Work Order Updates', roles: ['TENANT', 'MANAGER', 'ADMIN', 'VENDOR'] },
  { value: 'LEASE_EXPIRING', label: 'Lease Expiring', roles: ['TENANT', 'MANAGER', 'ADMIN'] },
  { value: 'PAYMENT_DUE', label: 'Payment Due', roles: ['TENANT', 'MANAGER', 'ADMIN'] },
  { value: 'PAYMENT_RECEIVED', label: 'Payment Received', roles: ['TENANT', 'MANAGER', 'ADMIN'] },
  { value: 'LATE_FEE', label: 'Late Fee', roles: ['TENANT', 'MANAGER', 'ADMIN'] },
  { value: 'RENEWAL_OFFER', label: 'Renewal Offers', roles: ['TENANT', 'MANAGER', 'ADMIN'] },
  { value: 'BID_UPDATE', label: 'Bid Updates', roles: ['MANAGER', 'ADMIN', 'VENDOR'] },
  { value: 'AGENT_ACTION', label: 'Agent Actions', roles: ['MANAGER', 'ADMIN'] },
  { value: 'GENERAL', label: 'General', roles: ['TENANT', 'MANAGER', 'ADMIN', 'VENDOR'] },
]

const DEFAULTS: Record<Channel, boolean> = { IN_APP: true, EMAIL: true, SMS: false }

export default function NotificationPreferencesPage() {
  const { data: session } = useSession()
  const role = session?.user?.systemRole ?? 'TENANT'

  const [prefs, setPrefs] = useState<Map<string, boolean>>(new Map())
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const visibleTypes = NOTIFICATION_TYPES.filter(t => t.roles.includes(role))

  useEffect(() => {
    fetch('/api/notification-preferences')
      .then(r => r.json())
      .then(data => {
        const map = new Map<string, boolean>()
        for (const row of data.preferences ?? []) {
          map.set(`${row.notificationType}:${row.channel}`, row.enabled)
        }
        setPrefs(map)
        setPhone(data.phone ?? '')
        setLoading(false)
      })
  }, [])

  function getEnabled(type: string, channel: Channel): boolean {
    const key = `${type}:${channel}`
    if (prefs.has(key)) return prefs.get(key)!
    return DEFAULTS[channel]
  }

  function toggle(type: string, channel: Channel) {
    const key = `${type}:${channel}`
    setPrefs(prev => {
      const next = new Map(prev)
      next.set(key, !getEnabled(type, channel))
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    const preferences: PrefRow[] = []
    for (const t of visibleTypes) {
      for (const c of CHANNELS) {
        preferences.push({
          notificationType: t.value,
          channel: c.key,
          enabled: getEnabled(t.value, c.key),
        })
      }
    }
    await fetch('/api/notification-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences, phone }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
        Loading...
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Notification Preferences" />

      {/* Phone number */}
      <Card>
        <CardHeader>
          <CardTitle>Phone Number (for SMS)</CardTitle>
        </CardHeader>
        <p className="text-xs text-gray-500 mb-3">
          Enter your phone number to receive SMS notifications. Format: +1XXXXXXXXXX
        </p>
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="+1234567890"
          className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </Card>

      {/* Preference grid */}
      <Card>
        <CardHeader>
          <CardTitle>Channel Preferences</CardTitle>
        </CardHeader>
        <p className="text-xs text-gray-500 mb-4">
          Choose how you receive each type of notification.
        </p>

        {/* Header row */}
        <div className="grid grid-cols-4 gap-4 mb-2 px-1">
          <div className="text-sm font-medium text-gray-700">Type</div>
          {CHANNELS.map(c => (
            <div key={c.key} className="text-sm font-medium text-gray-700 text-center">
              {c.label}
            </div>
          ))}
        </div>

        <div className="divide-y divide-gray-100">
          {visibleTypes.map(t => (
            <div key={t.value} className="grid grid-cols-4 gap-4 py-3 px-1 items-center">
              <div className="text-sm text-gray-700">{t.label}</div>
              {CHANNELS.map(c => {
                const enabled = getEnabled(t.value, c.key)
                const isInApp = c.key === 'IN_APP'
                return (
                  <div key={c.key} className="flex justify-center">
                    <button
                      onClick={() => !isInApp && toggle(t.value, c.key)}
                      disabled={isInApp}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        enabled ? 'bg-blue-600' : 'bg-gray-200'
                      } ${isInApp ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Preferences'}
        </Button>
        {saved && (
          <span className="text-sm text-green-600 font-medium">Saved!</span>
        )}
      </div>
    </div>
  )
}
