'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ClipboardCheck, Plus, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-yellow-50 text-yellow-700',
  COMPLETED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
}

const TYPE_LABELS: Record<string, string> = {
  MOVE_IN: 'Move-In',
  MOVE_OUT: 'Move-Out',
  ROUTINE: 'Routine',
  DRIVE_BY: 'Drive-By',
}

export default function InspectionsPage() {
  const [inspections, setInspections] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterProperty, setFilterProperty] = useState('')

  // New inspection form
  const [form, setForm] = useState({ propertyId: '', unitId: '', type: 'ROUTINE', scheduledAt: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    if (filterProperty) params.set('propertyId', filterProperty)
    const [iRes, pRes] = await Promise.all([
      fetch(`/api/inspections?${params}`),
      fetch('/api/properties?status=ACTIVE'),
    ])
    const [iData, pData] = await Promise.all([iRes.json(), pRes.json()])
    setInspections(Array.isArray(iData) ? iData : [])
    setProperties(Array.isArray(pData) ? pData : pData.properties ?? [])
  }, [filterStatus, filterProperty])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/inspections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setShowModal(false)
    setForm({ propertyId: '', unitId: '', type: 'ROUTINE', scheduledAt: '', notes: '' })
    load()
  }

  const now = new Date()

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div>
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="h-4 w-4" /> Back to Dashboard
      </Link>
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Inspections" subtitle="Schedule and track property inspections" />
        <Button onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Schedule Inspection
        </Button>
      </div>

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
          {['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      <Card padding="none">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Property / Unit</TableHeader>
              <TableHeader>Type</TableHeader>
              <TableHeader>Scheduled</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Items</TableHeader>
              <TableHeader></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {inspections.length === 0 && <TableEmptyState message="No inspections found" />}
            {inspections.map((insp: any) => {
              const overdue = insp.status === 'SCHEDULED' && new Date(insp.scheduledAt) < now
              return (
                <TableRow key={insp.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{insp.property?.name}</div>
                    {insp.unit && <div className="text-xs text-gray-400">Unit {insp.unit.unitNumber}</div>}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-700">{TYPE_LABELS[insp.type] ?? insp.type}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm">
                      {overdue && <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                      <span className={overdue ? 'text-red-600 font-medium' : 'text-gray-600'}>
                        {formatDate(insp.scheduledAt)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[insp.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {insp.status.replace(/_/g, ' ')}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">{insp._count?.items ?? 0} items</TableCell>
                  <TableCell>
                    <Link href={`/dashboard/inspections/${insp.id}`} className="text-sm text-blue-600 hover:underline">
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      {showModal && (
        <Modal isOpen={showModal} title="Schedule Inspection" onClose={() => setShowModal(false)}>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Date</label>
              <input
                type="datetime-local"
                required
                value={form.scheduledAt}
                onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
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
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Schedule'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
