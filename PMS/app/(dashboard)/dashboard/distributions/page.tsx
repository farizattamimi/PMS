'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { formatCurrency } from '@/lib/utils'

const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function DistributionsManagerPage() {
  const [distributions, setDistributions] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ propertyId: '', period: new Date().toISOString().slice(0, 7), managementFeePct: '8', memo: '' })
  const [saving, setSaving] = useState(false)
  const [filterProp, setFilterProp] = useState('')

  async function loadDistributions() {
    const url = filterProp ? `/api/distributions?propertyId=${filterProp}` : '/api/distributions'
    const res = await fetch(url)
    const data = await res.json()
    setDistributions(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/properties').then(r => r.json()),
      fetch('/api/distributions').then(r => r.json()),
    ]).then(([props, dists]) => {
      setProperties(Array.isArray(props) ? props : props.properties ?? [])
      setDistributions(Array.isArray(dists) ? dists : [])
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (!loading) loadDistributions() }, [filterProp])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/distributions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, managementFeePct: parseFloat(form.managementFeePct) }),
    })
    setSaving(false)
    setShowModal(false)
    setForm({ propertyId: '', period: new Date().toISOString().slice(0, 7), managementFeePct: '8', memo: '' })
    loadDistributions()
  }

  async function handleAction(id: string, status: string) {
    await fetch(`/api/distributions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    loadDistributions()
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>

  return (
    <div>
      <PageHeader title="Distributions" subtitle="Create and manage owner distribution statements" />

      <div className="flex items-center justify-between mb-4">
        <select className={INPUT_CLS + ' w-64'} value={filterProp} onChange={e => setFilterProp(e.target.value)}>
          <option value="">All Properties</option>
          {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <Button onClick={() => setShowModal(true)}>Create Distribution</Button>
      </div>

      <Card padding="none">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Period</TableHeader>
              <TableHeader>Property</TableHeader>
              <TableHeader>Owner Org</TableHeader>
              <TableHeader>Gross</TableHeader>
              <TableHeader>Expenses</TableHeader>
              <TableHeader>Mgmt Fee</TableHeader>
              <TableHeader>Net</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {distributions.length === 0 && <TableEmptyState message="No distribution statements" />}
            {distributions.map(d => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.period}</TableCell>
                <TableCell className="text-gray-500 text-sm">{d.property?.name}</TableCell>
                <TableCell className="text-gray-500 text-sm">{d.ownerOrg?.name}</TableCell>
                <TableCell className="text-green-700">{formatCurrency(d.grossIncome)}</TableCell>
                <TableCell className="text-red-700">({formatCurrency(d.expenses)})</TableCell>
                <TableCell className="text-gray-500">{formatCurrency(d.managementFee)}</TableCell>
                <TableCell className="font-bold text-blue-700">{formatCurrency(d.netDistribution)}</TableCell>
                <TableCell><Badge variant={d.status === 'PAID' ? 'success' : d.status === 'APPROVED' ? 'info' : 'gray'}>{d.status}</Badge></TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {d.status === 'DRAFT' && <button onClick={() => handleAction(d.id, 'APPROVED')} className="text-xs text-blue-600 hover:underline font-medium">Approve</button>}
                    {d.status === 'APPROVED' && <button onClick={() => handleAction(d.id, 'PAID')} className="text-xs text-green-600 hover:underline font-medium">Mark Paid</button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Create Distribution Statement">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Property *</label>
            <select className={INPUT_CLS} value={form.propertyId} onChange={e => setForm(f => ({ ...f, propertyId: e.target.value }))} required>
              <option value="">Select property</option>
              {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Period *</label>
            <input className={INPUT_CLS} type="month" value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Management Fee %</label>
            <input className={INPUT_CLS} type="number" step="0.1" min="0" max="100" value={form.managementFeePct} onChange={e => setForm(f => ({ ...f, managementFeePct: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Memo</label>
            <textarea className={INPUT_CLS} rows={2} value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'Creating…' : 'Create'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
