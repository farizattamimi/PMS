'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, AlertTriangle, Clock } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { formatDate } from '@/lib/utils'

const SEVERITY_VARIANT: Record<string, 'danger' | 'warning' | 'info' | 'gray'> = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'gray',
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'info' | 'gray'> = {
  OPEN: 'warning',
  IN_REVIEW: 'info',
  RESOLVED: 'success',
  CLOSED: 'gray',
}

const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function IncidentsPage() {
  const { data: session } = useSession()
  const role = session?.user?.systemRole
  const isManager = role === 'ADMIN' || role === 'MANAGER'

  const [incidents, setIncidents] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')
  const [filterProperty, setFilterProperty] = useState('')

  // Create modal
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    propertyId: '',
    category: 'NOISE',
    title: '',
    description: '',
    severity: 'MEDIUM',
  })
  const [saving, setSaving] = useState(false)

  // Resolve modal
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolution, setResolution] = useState('')

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    if (filterSeverity) params.set('severity', filterSeverity)
    if (filterProperty) params.set('propertyId', filterProperty)
    const res = await fetch(`/api/incidents?${params}`)
    setIncidents(await res.json())
    setLoading(false)
  }, [filterStatus, filterSeverity, filterProperty])

  useEffect(() => {
    fetch('/api/properties').then(r => r.json()).then(setProperties)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setShowModal(false)
    setForm({ propertyId: '', category: 'NOISE', title: '', description: '', severity: 'MEDIUM' })
    load()
  }

  async function handleResolve(incidentId: string) {
    await fetch(`/api/incidents/${incidentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RESOLVED', resolution }),
    })
    setResolvingId(null)
    setResolution('')
    load()
  }

  async function updateStatus(incidentId: string, status: string) {
    await fetch(`/api/incidents/${incidentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
  }

  const now = new Date()

  return (
    <div>
      <PageHeader
        title="Incidents"
        subtitle="Complaints, safety issues, and lease violations"
        action={
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-2" /> Report Incident
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filterProperty} onChange={e => setFilterProperty(e.target.value)}>
          <option value="">All Properties</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {['OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
          <option value="">All Severities</option>
          {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(s => <option key={s} value={s}>{s}</option>)}
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
                <TableHeader>Category</TableHeader>
                <TableHeader>Severity</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>SLA</TableHeader>
                {isManager && <TableHeader></TableHeader>}
              </TableRow>
            </TableHead>
            <TableBody>
              {incidents.length === 0 && <TableEmptyState message="No incidents found." />}
              {incidents.map(inc => {
                const sla = inc.slaDeadline ? new Date(inc.slaDeadline) : null
                const pastSla = sla && sla < now && !['RESOLVED', 'CLOSED'].includes(inc.status)
                const hoursLeft = sla ? Math.round((sla.getTime() - now.getTime()) / (1000 * 60 * 60)) : null
                return (
                  <TableRow key={inc.id}>
                    <TableCell>
                      <p className="font-medium text-sm">{inc.title}</p>
                      <p className="text-xs text-gray-400 truncate max-w-[200px]">{inc.description}</p>
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">{inc.property?.name}</TableCell>
                    <TableCell className="text-gray-500 text-xs">{inc.category.replace('_', ' ')}</TableCell>
                    <TableCell><Badge variant={SEVERITY_VARIANT[inc.severity]}>{inc.severity}</Badge></TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[inc.status]}>{inc.status.replace('_', ' ')}</Badge></TableCell>
                    <TableCell>
                      {sla && (
                        <div className={`flex items-center gap-1 text-xs ${pastSla ? 'text-red-600 font-semibold' : hoursLeft !== null && hoursLeft < 12 ? 'text-orange-600' : 'text-gray-500'}`}>
                          {pastSla ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                          {pastSla ? 'Past SLA' : hoursLeft !== null && hoursLeft > 0 ? `${hoursLeft}h left` : formatDate(sla)}
                        </div>
                      )}
                    </TableCell>
                    {isManager && (
                      <TableCell>
                        <div className="flex gap-2 text-xs">
                          {inc.status === 'OPEN' && (
                            <button onClick={() => updateStatus(inc.id, 'IN_REVIEW')} className="text-blue-600 hover:underline">Review</button>
                          )}
                          {['OPEN', 'IN_REVIEW'].includes(inc.status) && (
                            <button onClick={() => { setResolvingId(inc.id); setResolution('') }} className="text-green-600 hover:underline">Resolve</button>
                          )}
                          {inc.status === 'RESOLVED' && (
                            <button onClick={() => updateStatus(inc.id, 'CLOSED')} className="text-gray-500 hover:underline">Close</button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Report Incident">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Property *</label>
            <select className={INPUT_CLS} value={form.propertyId} onChange={e => setForm({ ...form, propertyId: e.target.value })} required>
              <option value="">Select property…</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select className={INPUT_CLS} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {['NOISE', 'LEASE_VIOLATION', 'SAFETY', 'HARASSMENT', 'PROPERTY_DAMAGE', 'OTHER'].map(c => (
                  <option key={c} value={c}>{c.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
              <select className={INPUT_CLS} value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input className={INPUT_CLS} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required placeholder="Brief summary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <textarea className={INPUT_CLS} rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required placeholder="Detailed description of the incident" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit'}</Button>
          </div>
        </form>
      </Modal>

      {/* Resolve modal */}
      <Modal isOpen={!!resolvingId} onClose={() => setResolvingId(null)} title="Resolve Incident">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Resolution notes</label>
            <textarea className={INPUT_CLS} rows={4} value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Describe how this was resolved…" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setResolvingId(null)}>Cancel</Button>
            <Button onClick={() => resolvingId && handleResolve(resolvingId)}>Mark Resolved</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
