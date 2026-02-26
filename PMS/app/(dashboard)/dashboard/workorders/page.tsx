'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Plus, Layers, CheckSquare } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { WorkOrderPriorityBadge, WorkOrderStatusBadge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'

const STATUSES   = ['NEW','ASSIGNED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELED']
const CATEGORIES = ['PLUMBING','HVAC','ELECTRICAL','GENERAL','TURNOVER','OTHER']
const PRIORITIES = ['LOW','MEDIUM','HIGH','EMERGENCY']

export default function WorkOrdersPage() {
  const { data: session } = useSession()
  const isManager = session?.user?.systemRole === 'ADMIN' || session?.user?.systemRole === 'MANAGER'

  const [workOrders, setWorkOrders] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [vendors, setVendors]       = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState({ propertyId: '', status: '', category: '', priority: '' })

  // Single create modal
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ propertyId: '', unitId: '', title: '', description: '', category: 'GENERAL', priority: 'MEDIUM' })
  const [saving, setSaving] = useState(false)
  const [units, setUnits]   = useState<any[]>([])

  // Bulk selection
  const [selected, setSelected]         = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction]     = useState('')
  const [bulkValue, setBulkValue]       = useState('')
  const [bulkRunning, setBulkRunning]   = useState(false)
  const [bulkResult, setBulkResult]     = useState<string>('')

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (filter.propertyId) params.set('propertyId', filter.propertyId)
    if (filter.status)     params.set('status',     filter.status)
    if (filter.category)   params.set('category',   filter.category)
    if (filter.priority)   params.set('priority',   filter.priority)
    const res = await fetch(`/api/workorders?${params}`)
    setWorkOrders(await res.json())
    setLoading(false)
  }, [filter])

  useEffect(() => {
    if (isManager) {
      fetch('/api/properties').then(r => r.json()).then(setProperties)
      fetch('/api/vendors').then(r => r.json()).then(setVendors)
    }
  }, [isManager])

  useEffect(() => { load() }, [load])
  // Clear selection when list reloads
  useEffect(() => { setSelected(new Set()); setBulkResult('') }, [workOrders])

  useEffect(() => {
    if (form.propertyId) {
      fetch(`/api/units?propertyId=${form.propertyId}`).then(r => r.json()).then(setUnits)
    } else {
      setUnits([])
    }
  }, [form.propertyId])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    await fetch('/api/workorders', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...form, unitId: form.unitId || undefined }),
    })
    setSaving(false)
    setShowModal(false)
    setForm({ propertyId: '', unitId: '', title: '', description: '', category: 'GENERAL', priority: 'MEDIUM' })
    load()
  }

  // ── Bulk selection helpers ────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === workOrders.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(workOrders.map((w: any) => w.id)))
    }
  }

  async function applyBulkAction() {
    if (!bulkAction || selected.size === 0) return
    if (bulkAction !== 'CANCEL' && !bulkValue) return

    setBulkRunning(true)
    setBulkResult('')
    const res = await fetch('/api/workorders/bulk-action', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        ids:    Array.from(selected),
        action: bulkAction,
        value:  bulkValue || undefined,
      }),
    })
    const data = await res.json()
    setBulkRunning(false)
    if (res.ok) {
      setBulkResult(`${data.updated} work order${data.updated !== 1 ? 's' : ''} updated.`)
      setBulkAction('')
      setBulkValue('')
      load()
    } else {
      setBulkResult(data.error ?? 'Error')
    }
  }

  const allChecked = workOrders.length > 0 && selected.size === workOrders.length
  const someChecked = selected.size > 0 && !allChecked

  return (
    <div>
      <PageHeader
        title="Work Orders"
        subtitle={isManager ? 'All maintenance and service requests' : 'Your submitted requests'}
        action={
          isManager ? (
            <div className="flex items-center gap-2">
              <Link href="/dashboard/workorders/bulk-create">
                <Button variant="ghost" size="sm">
                  <Layers className="h-4 w-4 mr-1.5" /> Bulk Create
                </Button>
              </Link>
              <Button onClick={() => setShowModal(true)}>
                <Plus className="h-4 w-4 mr-2" /> Create Work Order
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        {isManager && (
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filter.propertyId} onChange={e => setFilter({...filter, propertyId: e.target.value})}>
            <option value="">All Properties</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filter.status} onChange={e => setFilter({...filter, status: e.target.value})}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filter.category} onChange={e => setFilter({...filter, category: e.target.value})}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filter.priority} onChange={e => setFilter({...filter, priority: e.target.value})}>
          <option value="">All Priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Bulk action toolbar */}
      {isManager && selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl flex-wrap">
          <span className="text-sm font-medium text-blue-800">
            <CheckSquare className="inline h-4 w-4 mr-1 mb-0.5" />
            {selected.size} selected
          </span>

          <select
            className="border border-blue-300 rounded-lg px-3 py-1.5 text-sm bg-white"
            value={bulkAction}
            onChange={e => { setBulkAction(e.target.value); setBulkValue('') }}
          >
            <option value="">Choose action…</option>
            <option value="UPDATE_STATUS">Update Status</option>
            <option value="UPDATE_PRIORITY">Update Priority</option>
            <option value="ASSIGN_VENDOR">Assign Vendor</option>
            <option value="CANCEL">Cancel Selected</option>
          </select>

          {bulkAction === 'UPDATE_STATUS' && (
            <select className="border border-blue-300 rounded-lg px-3 py-1.5 text-sm bg-white" value={bulkValue} onChange={e => setBulkValue(e.target.value)}>
              <option value="">Pick status…</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          )}
          {bulkAction === 'UPDATE_PRIORITY' && (
            <select className="border border-blue-300 rounded-lg px-3 py-1.5 text-sm bg-white" value={bulkValue} onChange={e => setBulkValue(e.target.value)}>
              <option value="">Pick priority…</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {bulkAction === 'ASSIGN_VENDOR' && (
            <select className="border border-blue-300 rounded-lg px-3 py-1.5 text-sm bg-white" value={bulkValue} onChange={e => setBulkValue(e.target.value)}>
              <option value="">Pick vendor…</option>
              {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          )}

          <Button
            size="sm"
            disabled={bulkRunning || !bulkAction || (bulkAction !== 'CANCEL' && !bulkValue)}
            onClick={applyBulkAction}
          >
            {bulkRunning ? 'Applying…' : 'Apply'}
          </Button>

          <button
            className="text-xs text-blue-600 hover:underline ml-auto"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>

          {bulkResult && (
            <span className="text-xs text-green-700 font-medium">{bulkResult}</span>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <Card padding="none">
          <Table>
            <TableHead>
              <TableRow>
                {isManager && (
                  <TableHeader className="w-10">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={el => { if (el) el.indeterminate = someChecked }}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                    />
                  </TableHeader>
                )}
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
              {workOrders.length === 0 && (
                <TableEmptyState message="No work orders found" />
              )}
              {workOrders.map((w: any) => (
                <TableRow key={w.id} className={selected.has(w.id) ? 'bg-blue-50' : ''}>
                  {isManager && (
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(w.id)}
                        onChange={() => toggleSelect(w.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <Link href={`/dashboard/workorders/${w.id}`} className="font-medium text-blue-600 hover:underline">
                      {w.title}
                    </Link>
                  </TableCell>
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

      {/* Single create modal */}
      {isManager && (
        <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Create Work Order">
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
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Category</label><select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Priority</label><select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>{PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
