'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'

const ACTION_TYPES = [
  { value: 'SEND_MESSAGE', label: 'Send Message' },
  { value: 'ASSIGN_VENDOR', label: 'Assign Vendor' },
  { value: 'SEND_BID_REQUEST', label: 'Send Bid Request' },
  { value: 'ACCEPT_BID', label: 'Accept Bid' },
  { value: 'SEND_RENEWAL_OFFER', label: 'Send Renewal Offer' },
  { value: 'CREATE_WORK_ORDER', label: 'Create Work Order' },
]

const TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'concise', label: 'Concise' },
]

export default function AgentSettingsPage() {
  const [settings, setSettings] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/agent/settings')
      .then(r => r.json())
      .then(d => setSettings(d))
  }, [])

  async function handleSave() {
    setSaving(true)
    const res = await fetch('/api/agent/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    const updated = await res.json()
    setSettings(updated)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function toggleAutoExecute(type: string) {
    setSettings((prev: any) => {
      const current: string[] = prev.autoExecuteTypes ?? []
      const next = current.includes(type) ? current.filter((t: string) => t !== type) : [...current, type]
      return { ...prev, autoExecuteTypes: next }
    })
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
        Loading...
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard/agent-inbox" className="flex items-center gap-1 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" /> Agent Inbox
        </Link>
      </div>

      <PageHeader title="Agent Settings" />

      {/* Master toggle */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Enabled</CardTitle>
        </CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-700 font-medium">Enable autonomous agent</p>
            <p className="text-xs text-gray-500 mt-0.5">
              When enabled, the agent runs on a schedule and proposes actions for your portfolio.
            </p>
          </div>
          <button
            onClick={() => setSettings((p: any) => ({ ...p, enabled: !p.enabled }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.enabled ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                settings.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </Card>

      {/* Tone */}
      <Card>
        <CardHeader>
          <CardTitle>Communication Tone</CardTitle>
        </CardHeader>
        <p className="text-xs text-gray-500 mb-3">
          Controls the tone used when drafting messages on your behalf.
        </p>
        <div className="flex gap-2">
          {TONES.map(t => (
            <button
              key={t.value}
              onClick={() => setSettings((p: any) => ({ ...p, tone: t.value }))}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                settings.tone === t.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Auto-execute */}
      <Card>
        <CardHeader>
          <CardTitle>Auto-Execute Actions</CardTitle>
        </CardHeader>
        <p className="text-xs text-gray-500 mb-4">
          Actions of the selected types will be executed automatically without requiring your approval.
        </p>
        <div className="space-y-3">
          {ACTION_TYPES.map(t => {
            const enabled = (settings.autoExecuteTypes ?? []).includes(t.value)
            return (
              <div key={t.value} className="flex items-center justify-between py-1">
                <span className="text-sm text-gray-700">{t.label}</span>
                <button
                  onClick={() => toggleAutoExecute(t.value)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    enabled ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
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
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
        {saved && (
          <span className="text-sm text-green-600 font-medium">Saved!</span>
        )}
      </div>
    </div>
  )
}
