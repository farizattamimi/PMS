'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { LeaseStatusBadge } from '@/components/ui/Badge'
import { formatCurrency, formatDate, daysUntil } from '@/lib/utils'
import { cn } from '@/lib/utils'

export default function LeasesPage() {
  const [leases, setLeases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [units, setUnits] = useState<any[]>([])
  const [tenants, setTenants] = useState<any[]>([])
  const [form, setForm] = useState({
    unitId: '', tenantId: '', startDate: '', endDate: '',
    monthlyRent: '', depositAmount: '',
  })
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState('ACTIVE')

  const load = useCallback(async () => {
    const params = statusFilter ? `?status=${statusFilter}` : ''
    const res = await fetch(`/api/leases${params}`)
    setLeases(await res.json())
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  async function openModal() {
    const [uRes, tRes] = await Promise.all([
      fetch('/api/units?status=AVAILABLE'),
      fetch('/api/tenants'),
    ])
    setUnits(await uRes.json())
    setTenants(await tRes.json())
    setShowModal(true)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/leases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        monthlyRent: parseFloat(form.monthlyRent),
        depositAmount: parseFloat(form.depositAmount || '0'),
      }),
    })
    setSaving(false)
    setShowModal(false)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Leases"
        subtitle={`${leases.length} leases`}
        action={
          <Button onClick={openModal}>
            <Plus className="h-4 w-4 mr-2" /> New Lease
          </Button>
        }
      />

      <div className="flex gap-2 mb-4">
        {['DRAFT', 'ACTIVE', 'ENDED', 'TERMINATED', ''].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              statusFilter === s
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      <Card padding="none">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Tenant</TableHeader>
              <TableHeader>Unit</TableHeader>
              <TableHeader>Property</TableHeader>
              <TableHeader>Start</TableHeader>
              <TableHeader>End</TableHeader>
              <TableHeader>Rent</TableHeader>
              <TableHeader>Expires In</TableHeader>
              <TableHeader>Status</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableEmptyState message="Loading…" />}
            {!loading && leases.length === 0 && <TableEmptyState message="No leases found" />}
            {leases.map(l => {
              const days = daysUntil(l.endDate)
              return (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.tenant?.user?.name}</TableCell>
                  <TableCell>#{l.unit?.unitNumber}</TableCell>
                  <TableCell className="text-gray-500">{l.unit?.property?.name}</TableCell>
                  <TableCell className="text-gray-500">{formatDate(l.startDate)}</TableCell>
                  <TableCell className="text-gray-500">{formatDate(l.endDate)}</TableCell>
                  <TableCell>{formatCurrency(l.monthlyRent)}</TableCell>
                  <TableCell>
                    <span className={cn(
                      'text-sm font-medium',
                      days < 0 ? 'text-gray-400' :
                      days <= 30 ? 'text-red-600' :
                      days <= 60 ? 'text-yellow-600' : 'text-gray-600'
                    )}>
                      {days < 0 ? 'Expired' : `${days}d`}
                    </span>
                  </TableCell>
                  <TableCell><LeaseStatusBadge status={l.status} /></TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Create Lease" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vacant Unit</label>
              <select
                required
                value={form.unitId}
                onChange={e => setForm(p => ({ ...p, unitId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select unit…</option>
                {units.map(u => (
                  <option key={u.id} value={u.id}>{u.property?.name} #{u.unitNumber}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
              <select
                required
                value={form.tenantId}
                onChange={e => setForm(p => ({ ...p, tenantId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select tenant…</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>{t.user?.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {(['startDate', 'endDate'] as const).map(f => (
              <div key={f}>
                <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                  {f === 'startDate' ? 'Start Date' : 'End Date'}
                </label>
                <input
                  type="date"
                  required
                  value={form[f]}
                  onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Rent ($)</label>
              <input
                type="number"
                required
                step="0.01"
                value={form.monthlyRent}
                onChange={e => setForm(p => ({ ...p, monthlyRent: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deposit ($)</label>
              <input
                type="number"
                step="0.01"
                value={form.depositAmount}
                onChange={e => setForm(p => ({ ...p, depositAmount: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving} className="flex-1">{saving ? 'Creating…' : 'Create Lease'}</Button>
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
