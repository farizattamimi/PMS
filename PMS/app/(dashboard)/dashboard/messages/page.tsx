'use client'

import { useEffect, useState, useCallback } from 'react'
import { MessageSquare, Plus } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import { useSession } from 'next-auth/react'

export default function MessagesPage() {
  const { data: session } = useSession()
  const [threads, setThreads] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [tenants, setTenants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ propertyId: '', tenantId: '', subject: '', message: '' })
  const [saving, setSaving] = useState(false)

  const isManager = session?.user?.systemRole !== 'TENANT'

  const load = useCallback(async () => {
    const [tRes] = await Promise.all([fetch('/api/messages/threads')])
    const tData = await tRes.json()
    setThreads(Array.isArray(tData) ? tData : [])

    if (isManager) {
      const pRes = await fetch('/api/properties?status=ACTIVE')
      const pData = await pRes.json()
      setProperties(Array.isArray(pData) ? pData : pData.properties ?? [])
    }
  }, [isManager])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  async function loadTenants(propertyId: string) {
    if (!propertyId) { setTenants([]); return }
    const res = await fetch(`/api/tenants?propertyId=${propertyId}&status=ACTIVE`)
    const data = await res.json()
    setTenants(Array.isArray(data) ? data : data.tenants ?? [])
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/messages/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setShowModal(false)
    setForm({ propertyId: '', tenantId: '', subject: '', message: '' })
    load()
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
    </div>
  )

  const totalUnread = threads.reduce((s: number, t: any) => s + (t.unreadCount ?? 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <PageHeader
          title="Messages"
          subtitle={totalUnread > 0 ? `${totalUnread} unread message${totalUnread > 1 ? 's' : ''}` : 'All caught up'}
        />
        {isManager && (
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New Thread
          </Button>
        )}
      </div>

      {threads.length === 0 ? (
        <Card className="text-center py-12">
          <MessageSquare className="h-12 w-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500">No messages yet.</p>
          {isManager && <p className="text-sm text-gray-400 mt-1">Start a conversation with a tenant.</p>}
        </Card>
      ) : (
        <div className="space-y-2">
          {threads.map((thread: any) => {
            const lastMsg = thread.messages?.[0]
            const hasUnread = (thread.unreadCount ?? 0) > 0
            return (
              <Link
                key={thread.id}
                href={`/dashboard/messages/${thread.id}`}
                className={`block rounded-xl border p-4 hover:bg-gray-50 transition-colors ${hasUnread ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 bg-white'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {hasUnread && <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />}
                      <span className={`text-sm font-semibold truncate ${hasUnread ? 'text-blue-900' : 'text-gray-900'}`}>
                        {thread.subject}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {isManager && <span>{thread.tenant?.user?.name}</span>}
                      <span>·</span>
                      <span>{thread.property?.name}</span>
                      {thread.status === 'CLOSED' && <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Closed</span>}
                    </div>
                    {lastMsg && (
                      <p className="text-xs text-gray-400 mt-1 truncate">{lastMsg.body}</p>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 flex-shrink-0">
                    {thread.updatedAt ? formatDate(thread.updatedAt) : ''}
                    {hasUnread && (
                      <span className="ml-2 bg-blue-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {thread.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {showModal && (
        <Modal isOpen={showModal} title="New Message Thread" onClose={() => setShowModal(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
              <select
                required
                value={form.propertyId}
                onChange={e => {
                  setForm(f => ({ ...f, propertyId: e.target.value, tenantId: '' }))
                  loadTenants(e.target.value)
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select property…</option>
                {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {form.propertyId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
                <select
                  required
                  value={form.tenantId}
                  onChange={e => setForm(f => ({ ...f, tenantId: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select tenant…</option>
                  {tenants.map((t: any) => <option key={t.id} value={t.id}>{t.user?.name ?? t.id}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input
                required
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="Message subject…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea
                required
                rows={4}
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Type your message…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Sending…' : 'Send'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
