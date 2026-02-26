'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { WorkOrderPriorityBadge, WorkOrderStatusBadge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'

export default function WorkOrdersPage() {
  const { data: session } = useSession()
  const isManager = session?.user?.systemRole === 'ADMIN' || session?.user?.systemRole === 'MANAGER'
  const [workOrders, setWorkOrders] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ propertyId: '', status: '', category: '', priority: '' })
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ propertyId: '', unitId: '', title: '', description: '', category: 'GENERAL', priority: 'MEDIUM' })
  const [saving, setSaving] = useState(false)
  const [units, setUnits] = useState<any[]>([])

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (filter.propertyId) params.set('propertyId', filter.propertyId)
    if (filter.status) params.set('status', filter.status)
    if (filter.category) params.set('category', filter.category)
    if (filter.priority) params.set('priority', filter.priority)
    const res = await fetch(`/api/workorders?${params}`)
    setWorkOrders(await res.json())
    setLoading(false)
  }, [filter])

  useEffect(() => {
    if (isManager) fetch('/api/properties').then(r => r.json()).then(setProperties)
  }, [isManager])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (form.propertyId) {
      fetch(`/api/units?propertyId=${form.propertyId}`).then(r => r.json()).then(setUnits)
    } else {
      setUnits([])
    }
  }, [form.propertyId])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    await fetch('/api/workorders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, unitId: form.unitId || undefined }) })
    setSaving(false); setShowModal(false); setForm({ propertyId: '', unitId: '', title: '', description: '', category: 'GENERAL', priority: 'MEDIUM' }); load()
  }

  return (
    <div>
      <PageHeader
        title="Work Orders"
        subtitle={isManager ? 'All maintenance and service requests' : 'Your submitted requests'}
        action={isManager ? <Button onClick={() => setShowModal(true)}><Plus className="h-4 w-4 mr-2" /> Create Work Order</Button> : undefined}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        {isManager && (
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filter.propertyId} onChange={e => setFilter({...filter, propertyId: e.target.value})}>
          <option value="">All Properties</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        )}
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filter.status} onChange={e => setFilter({...filter, status: e.target.value})}>
          <option value="">All Statuses</option>
          {['NEW','ASSIGNED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELED'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filter.category} onChange={e => setFilter({...filter, category: e.target.value})}>
          <option value="">All Categories</option>
          {['PLUMBING','HVAC','ELECTRICAL','GENERAL','TURNOVER','OTHER'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filter.priority} onChange={e => setFilter({...filter, priority: e.target.value})}>
          <option value="">All Priorities</option>
          {['LOW','MEDIUM','HIGH','EMERGENCY'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
      ) : (
        <Card padding="none">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Title</TableHeader>
                <TableHeader>Property</TableHeader>
                <TableHeader>Unit</TableHeader>
                <TableHeader>Category</TableHeader>
                <TableHeader>Priority</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Vendor</TableHeader>
                <TableHeader>Created</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {workOrders.length === 0 && <TableEmptyState message="No work orders found" />}
              {workOrders.map(w => (
                <TableRow key={w.id}>
                  <TableCell><Link href={`/dashboard/workorders/${w.id}`} className="font-medium text-blue-600 hover:underline">{w.title}</Link></TableCell>
                  <TableCell className="text-gray-500 text-sm">{w.property?.name}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{w.unit?.unitNumber ?? '—'}</TableCell>
                  <TableCell className="text-gray-500 text-xs">{w.category}</TableCell>
                  <TableCell><WorkOrderPriorityBadge priority={w.priority} /></TableCell>
                  <TableCell><WorkOrderStatusBadge status={w.status} /></TableCell>
                  <TableCell className="text-gray-500 text-sm">{w.assignedVendor?.name ?? '—'}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{formatDate(w.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {isManager && <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Create Work Order">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.propertyId} onChange={e => setForm({...form, propertyId: e.target.value, unitId: ''})} required>
              <option value="">Select property…</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {units.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit (optional)</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.unitId} onChange={e => setForm({...form, unitId: e.target.value})}>
                <option value="">— Property-wide —</option>
                {units.map(u => <option key={u.id} value={u.id}>Unit {u.unitNumber}</option>)}
              </select>
            </div>
          )}
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Title</label><input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Category</label><select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>{['PLUMBING','HVAC','ELECTRICAL','GENERAL','TURNOVER','OTHER'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Priority</label><select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>{['LOW','MEDIUM','HIGH','EMERGENCY'].map(p => <option key={p} value={p}>{p}</option>)}</select></div>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create'}</Button></div>
        </form>
      </Modal>}
    </div>
  )
}
