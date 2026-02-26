'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ShieldCheck, Plus, AlertTriangle, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { formatDate } from '@/lib/utils'

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-50 text-yellow-700',
  IN_PROGRESS: 'bg-blue-50 text-blue-700',
  COMPLIANT: 'bg-green-50 text-green-700',
  OVERDUE: 'bg-red-50 text-red-700',
  WAIVED: 'bg-gray-100 text-gray-500',
}

const CATEGORIES = [
  'FIRE_SAFETY', 'ELEVATOR', 'HEALTH_PERMIT', 'BUILDING_PERMIT',
  'HVAC_CERT', 'ELECTRICAL', 'PLUMBING', 'OTHER',
]

export default function CompliancePage() {
  const [items, setItems] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [resolveModal, setResolveModal] = useState<any>(null)
  const [filterProperty, setFilterProperty] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    propertyId: '', title: '', category: 'FIRE_SAFETY',
    authority: '', dueDate: '', renewalDays: '', notes: '',
  })

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (filterProperty) params.set('propertyId', filterProperty)
    if (filterStatus) params.set('status', filterStatus)
    const [cRes, pRes] = await Promise.all([
      fetch(`/api/compliance?${params}`),
      fetch('/api/properties?status=ACTIVE'),
    ])
    const [cData, pData] = await Promise.all([cRes.json(), pRes.json()])
    setItems(Array.isArray(cData) ? cData : [])
    setProperties(Array.isArray(pData) ? pData : pData.properties ?? [])
  }, [filterProperty, filterStatus])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/compliance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, renewalDays: form.renewalDays ? Number(form.renewalDays) : null }),
    })
    setSaving(false)
    setShowModal(false)
    setForm({ propertyId: '', title: '', category: 'FIRE_SAFETY', authority: '', dueDate: '', renewalDays: '', notes: '' })
    load()
  }

  async function markCompliant(id: string) {
    await fetch(`/api/compliance/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLIANT' }),
    })
    setResolveModal(null)
    load()
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this compliance item?')) return
    await fetch(`/api/compliance/${id}`, { method: 'DELETE' })
    load()
  }

  const now = new Date()

  function daysUntil(dateStr: string) {
    return Math.round((new Date(dateStr).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
    </div>
  )

  const overdueCount = items.filter(i => daysUntil(i.dueDate) < 0 && i.status !== 'COMPLIANT' && i.status !== 'WAIVED').length
  const dueSoonCount = items.filter(i => { const d = daysUntil(i.dueDate); return d >= 0 && d <= 30 && i.status !== 'COMPLIANT' && i.status !== 'WAIVED' }).length

  return (
    <div>
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="h-4 w-4" /> Back to Dashboard
      </Link>
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Compliance" subtitle="Track regulatory deadlines and certifications" />
        <Button onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Item
        </Button>
      </div>

      {/* Summary */}
      {(overdueCount > 0 || dueSoonCount > 0) && (
        <div className="mb-5 flex gap-3 flex-wrap">
          {overdueCount > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg">
              <AlertTriangle className="h-4 w-4" />
              <strong>{overdueCount}</strong> overdue item{overdueCount > 1 ? 's' : ''}
            </div>
          )}
          {dueSoonCount > 0 && (
            <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm px-4 py-2.5 rounded-lg">
              <AlertTriangle className="h-4 w-4" />
              <strong>{dueSoonCount}</strong> item{dueSoonCount > 1 ? 's' : ''} due within 30 days
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          value={filterProperty}
          onChange={e => setFilterProperty(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Properties</option>
          {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          {['PENDING', 'IN_PROGRESS', 'COMPLIANT', 'OVERDUE', 'WAIVED'].map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      <Card padding="none">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Item</TableHeader>
              <TableHeader>Property</TableHeader>
              <TableHeader>Category</TableHeader>
              <TableHeader>Due Date</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && <TableEmptyState message="No compliance items found" />}
            {items.map((item: any) => {
              const days = daysUntil(item.dueDate)
              const isOverdue = days < 0 && item.status !== 'COMPLIANT' && item.status !== 'WAIVED'
              const isDueSoon = days >= 0 && days <= 30 && item.status !== 'COMPLIANT' && item.status !== 'WAIVED'
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{item.title}</div>
                    {item.authority && <div className="text-xs text-gray-400">{item.authority}</div>}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{item.property?.name}</TableCell>
                  <TableCell className="text-xs text-gray-500">{item.category.replace(/_/g, ' ')}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {(isOverdue || isDueSoon) && <AlertTriangle className={`h-3.5 w-3.5 flex-shrink-0 ${isOverdue ? 'text-red-500' : 'text-yellow-500'}`} />}
                      <div>
                        <div className={`text-sm font-medium ${isOverdue ? 'text-red-600' : isDueSoon ? 'text-yellow-600' : 'text-gray-700'}`}>
                          {formatDate(item.dueDate)}
                        </div>
                        <div className={`text-xs ${isOverdue ? 'text-red-400' : isDueSoon ? 'text-yellow-500' : 'text-gray-400'}`}>
                          {isOverdue ? `${Math.abs(days)}d overdue` : `${days}d remaining`}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {item.status.replace(/_/g, ' ')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {item.status !== 'COMPLIANT' && item.status !== 'WAIVED' && (
                        <button
                          onClick={() => setResolveModal(item)}
                          className="text-xs text-green-600 hover:text-green-700 font-medium"
                        >
                          Mark Compliant
                        </button>
                      )}
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Create modal */}
      {showModal && (
        <Modal isOpen={showModal} title="Add Compliance Item" onClose={() => setShowModal(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
              <select
                required
                value={form.propertyId}
                onChange={e => setForm(f => ({ ...f, propertyId: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select property…</option>
                {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                required
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Annual Fire Inspection"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input
                  type="date"
                  required
                  value={form.dueDate}
                  onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Authority (optional)</label>
                <input
                  value={form.authority}
                  onChange={e => setForm(f => ({ ...f, authority: e.target.value }))}
                  placeholder="e.g. City Fire Marshal"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Renewal (days, optional)</label>
                <input
                  type="number"
                  min="1"
                  value={form.renewalDays}
                  onChange={e => setForm(f => ({ ...f, renewalDays: e.target.value }))}
                  placeholder="365"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Item'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Mark compliant confirm */}
      {resolveModal && (
        <Modal isOpen={!!resolveModal} title="Mark as Compliant" onClose={() => setResolveModal(null)}>
          <div className="mb-4">
            <p className="text-sm text-gray-600">Mark <strong>{resolveModal.title}</strong> as compliant?</p>
            {resolveModal.renewalDays && (
              <p className="text-sm text-gray-500 mt-1">
                This item will automatically renew in {resolveModal.renewalDays} days.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setResolveModal(null)}>Cancel</Button>
            <Button onClick={() => markCompliant(resolveModal.id)}>
              <CheckCircle className="h-4 w-4 mr-1.5" /> Confirm
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
