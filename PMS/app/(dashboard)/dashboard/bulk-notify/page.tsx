'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronLeft, Bell, CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface Property { id: string; name: string }
interface TenantUser { userId: string; name: string; email: string; unitNumber: string }

export default function BulkNotifyPage() {
  const [properties, setProperties]   = useState<Property[]>([])
  const [propertyId, setPropertyId]   = useState('')
  const [tenants, setTenants]         = useState<TenantUser[]>([])
  const [selectedIds, setSelected]    = useState<Set<string>>(new Set())
  const [allSelected, setAllSelected] = useState(true)
  const [loadingTenants, setLoadingTenants] = useState(false)

  const [title, setTitle] = useState('')
  const [body, setBody]   = useState('')

  const [sending, setSending]   = useState(false)
  const [result, setResult]     = useState<{ sent: number } | null>(null)
  const [error, setError]       = useState('')

  useEffect(() => {
    fetch('/api/properties').then(r => r.json()).then(setProperties)
  }, [])

  // Load tenants for selected property
  useEffect(() => {
    setTenants([])
    setSelected(new Set())
    setAllSelected(true)
    if (!propertyId) return

    setLoadingTenants(true)
    fetch(`/api/portal/tenants?propertyId=${propertyId}`)
      .then(async r => {
        if (!r.ok) return []
        return r.json()
      })
      .then((data: TenantUser[]) => {
        setTenants(data)
        setSelected(new Set(data.map(t => t.userId)))
      })
      .finally(() => setLoadingTenants(false))
  }, [propertyId])

  function toggleTenant(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      setAllSelected(false)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
      setAllSelected(false)
    } else {
      setSelected(new Set(tenants.map(t => t.userId)))
      setAllSelected(true)
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!title || selectedIds.size === 0) return
    setSending(true); setError('')
    try {
      const res = await fetch('/api/notifications/bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          propertyId:    allSelected ? propertyId : undefined,
          tenantUserIds: allSelected ? undefined : Array.from(selectedIds),
          title,
          body: body || undefined,
          type: 'MANAGER_ANNOUNCEMENT',
        }),
      })
      if (!res.ok) {
        const e = await res.json()
        setError(e.error ?? 'Failed to send notifications')
      } else {
        setResult(await res.json())
      }
    } finally {
      setSending(false)
    }
  }

  function reset() {
    setResult(null)
    setTitle('')
    setBody('')
    setPropertyId('')
    setTenants([])
    setSelected(new Set())
  }

  const recipientCount = allSelected ? tenants.length : selectedIds.size

  // ── Success ──────────────────────────────────────────────────────────────────

  if (result) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1">
            <ChevronLeft className="h-4 w-4" /> Dashboard
          </Link>
        </div>
        <Card className="p-10 text-center">
          <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Notifications Sent!
          </h2>
          <p className="text-gray-500 mb-6">
            {result.sent} tenant{result.sent !== 1 ? 's' : ''} notified successfully.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost">Back to Dashboard</Button>
            </Link>
            <Button onClick={reset}>Send Another</Button>
          </div>
        </Card>
      </div>
    )
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/dashboard" className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Dashboard
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <Bell className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bulk Notify Tenants</h1>
          <p className="text-sm text-gray-500">Send an in-app notification to multiple tenants at once</p>
        </div>
      </div>

      <form onSubmit={send} className="space-y-6">
        {/* Property + tenant selection */}
        <Card className="p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Recipients</h2>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={propertyId}
              onChange={e => setPropertyId(e.target.value)}
              required
            >
              <option value="">Select property…</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {loadingTenants && (
            <p className="text-sm text-gray-400">Loading tenants…</p>
          )}

          {!loadingTenants && propertyId && tenants.length === 0 && (
            <p className="text-sm text-gray-400">No active tenants found for this property.</p>
          )}

          {!loadingTenants && tenants.length > 0 && (
            <>
              {/* Select all */}
              <label className="flex items-center gap-2 mb-3 cursor-pointer border-b pb-3">
                <input
                  type="checkbox"
                  checked={selectedIds.size === tenants.length}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm font-medium text-gray-700">
                  All tenants ({tenants.length})
                </span>
              </label>

              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {tenants.map(t => (
                  <label
                    key={t.userId}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      selectedIds.has(t.userId)
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.userId)}
                      onChange={() => toggleTenant(t.userId)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {t.email} · Unit {t.unitNumber}
                      </p>
                    </div>
                  </label>
                ))}
              </div>

              <p className="text-xs text-gray-400 mt-3">
                {recipientCount} recipient{recipientCount !== 1 ? 's' : ''} selected
              </p>
            </>
          )}
        </Card>

        {/* Message */}
        <Card className="p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Message</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. Scheduled maintenance this weekend"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Body <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                rows={4}
                placeholder="Additional details…"
                value={body}
                onChange={e => setBody(e.target.value)}
              />
            </div>
          </div>
        </Card>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-between">
          <Link href="/dashboard">
            <Button type="button" variant="ghost">Cancel</Button>
          </Link>
          <Button
            type="submit"
            disabled={sending || !title || recipientCount === 0 || !propertyId}
          >
            {sending ? 'Sending…' : `Send to ${recipientCount} Tenant${recipientCount !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </form>
    </div>
  )
}
