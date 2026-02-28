'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, FileText, Plus } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
  TableEmptyState,
} from '@/components/ui/Table'
import { formatDate } from '@/lib/utils'

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: 'bg-blue-50 text-blue-700',
  UNDER_REVIEW: 'bg-yellow-50 text-yellow-700',
  APPROVED: 'bg-green-50 text-green-700',
  DENIED: 'bg-red-50 text-red-700',
  WITHDRAWN: 'bg-gray-100 text-gray-500',
}

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  DENIED: 'Denied',
  WITHDRAWN: 'Withdrawn',
}

const STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DENIED', 'WITHDRAWN']

export default function ApplicationsPage() {
  const { data: session } = useSession()
  const isManager = session?.user?.systemRole === 'ADMIN' || session?.user?.systemRole === 'MANAGER'

  const [applications, setApplications] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [units, setUnits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterProperty, setFilterProperty] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    propertyId: '',
    unitId: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    desiredMoveIn: '',
    desiredTerm: '12',
    monthlyIncome: '',
    employer: '',
    notes: '',
  })

  // Pre-fill tenant email when modal opens
  function openModal() {
    if (!isManager && session?.user?.email) {
      setForm(f => ({ ...f, email: session.user.email ?? '' }))
    }
    setShowModal(true)
  }

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (filterProperty) params.set('propertyId', filterProperty)
    if (filterStatus) params.set('status', filterStatus)
    const aRes = await fetch(`/api/applications?${params}`)
    const aData = await aRes.json()
    setApplications(Array.isArray(aData) ? aData : [])
    if (isManager) {
      const pRes = await fetch('/api/properties?status=ACTIVE')
      const pData = await pRes.json()
      setProperties(Array.isArray(pData) ? pData : pData.properties ?? [])
    }
  }, [filterProperty, filterStatus, isManager])

  useEffect(() => {
    if (session !== undefined) load().finally(() => setLoading(false))
  }, [session, load])

  // Load units when property changes in modal
  useEffect(() => {
    if (!form.propertyId) { setUnits([]); return }
    fetch(`/api/properties/${form.propertyId}`)
      .then(r => r.json())
      .then(d => setUnits(Array.isArray(d.units) ? d.units : []))
      .catch(() => setUnits([]))
  }, [form.propertyId])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          desiredTerm: Number(form.desiredTerm),
          monthlyIncome: form.monthlyIncome ? Number(form.monthlyIncome) : undefined,
          unitId: form.unitId || undefined,
        }),
      })
      setShowModal(false)
      setForm({
        propertyId: '',
        unitId: '',
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        desiredMoveIn: '',
        desiredTerm: '12',
        monthlyIncome: '',
        employer: '',
        notes: '',
      })
      load()
    } finally {
      setSaving(false)
    }
  }

  const pendingCount = applications.filter(
    a => a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW'
  ).length

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
        <PageHeader
          title="Applications"
          subtitle={isManager
            ? (pendingCount > 0 ? `${pendingCount} pending review` : 'Manage tenant applications')
            : 'Your rental applications'}
        />
        {!isManager && (
          <Button onClick={openModal}>
            <Plus className="h-4 w-4 mr-1.5" /> Apply for Unit
          </Button>
        )}
      </div>

      {/* Filters — managers only */}
      {isManager && (
        <div className="flex gap-3 mb-4 flex-wrap">
          <select
            value={filterProperty}
            onChange={e => setFilterProperty(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Properties</option>
            {properties.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            {STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      )}

      <Card padding="none">
        <Table>
          <TableHead>
            <TableRow>
              {isManager && <TableHeader>Applicant</TableHeader>}
              <TableHeader>Property / Unit</TableHeader>
              <TableHeader>Desired Move-In</TableHeader>
              <TableHeader>Status</TableHeader>
              {isManager && <TableHeader>Screening</TableHeader>}
              <TableHeader>Submitted</TableHeader>
              {isManager && <TableHeader></TableHeader>}
            </TableRow>
          </TableHead>
          <TableBody>
            {applications.length === 0 && (
              <TableEmptyState message="No applications found" />
            )}
            {applications.map((app: any) => (
              <TableRow key={app.id}>
                {isManager && (
                  <TableCell>
                    <div className="font-medium text-sm text-gray-900">
                      {app.firstName} {app.lastName}
                    </div>
                    <div className="text-xs text-gray-400">{app.email}</div>
                  </TableCell>
                )}
                <TableCell>
                  <div className="text-sm text-gray-700">{app.property?.name}</div>
                  {app.unit && (
                    <div className="text-xs text-gray-400">Unit {app.unit.unitNumber}</div>
                  )}
                </TableCell>
                <TableCell className="text-sm text-gray-600">
                  {formatDate(app.desiredMoveIn)}
                </TableCell>
                <TableCell>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[app.status] ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {STATUS_LABELS[app.status] ?? app.status}
                  </span>
                </TableCell>
                {isManager && (
                  <TableCell>
                    {(() => {
                      const sr = app.screeningReports?.[0]
                      if (!sr) return <span className="text-xs text-gray-400">Not run</span>
                      const colors: Record<string, string> = {
                        CLEAR: 'bg-green-50 text-green-700',
                        FLAG: 'bg-yellow-50 text-yellow-700',
                        FAIL: 'bg-red-50 text-red-700',
                        PENDING: 'bg-gray-100 text-gray-500',
                      }
                      return (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[sr.overallStatus] ?? colors.PENDING}`}>
                          {sr.overallStatus}
                        </span>
                      )
                    })()}
                  </TableCell>
                )}
                <TableCell className="text-sm text-gray-500">
                  {formatDate(app.createdAt)}
                </TableCell>
                {isManager && (
                  <TableCell>
                    <Link
                      href={`/dashboard/applications/${app.id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Review
                    </Link>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {!isManager && showModal && (
        <Modal isOpen={showModal} title="Apply for Unit" onClose={() => setShowModal(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            {/* Property */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property *</label>
              <select
                required
                value={form.propertyId}
                onChange={e => setForm(f => ({ ...f, propertyId: e.target.value, unitId: '' }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select property…</option>
                {properties.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            {/* Unit */}
            {units.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit (optional)</label>
                <select
                  value={form.unitId}
                  onChange={e => setForm(f => ({ ...f, unitId: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No specific unit</option>
                  {units.map((u: any) => (
                    <option key={u.id} value={u.id}>
                      Unit {u.unitNumber} — {u.bedrooms}br/{u.bathrooms}ba
                    </option>
                  ))}
                </select>
              </div>
            )}
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                <input
                  required
                  type="text"
                  value={form.firstName}
                  onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                <input
                  required
                  type="text"
                  value={form.lastName}
                  onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {/* Contact */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  disabled={!isManager}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                />
                {!isManager && <p className="text-xs text-gray-400 mt-1">Linked to your account</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {/* Move-in / Term */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Desired Move-In *</label>
                <input
                  required
                  type="date"
                  value={form.desiredMoveIn}
                  onChange={e => setForm(f => ({ ...f, desiredMoveIn: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Term (months) *</label>
                <input
                  required
                  type="number"
                  min="1"
                  value={form.desiredTerm}
                  onChange={e => setForm(f => ({ ...f, desiredTerm: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {/* Income / Employer */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Income</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.monthlyIncome}
                  onChange={e => setForm(f => ({ ...f, monthlyIncome: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employer</label>
                <input
                  type="text"
                  value={form.employer}
                  onChange={e => setForm(f => ({ ...f, employer: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Submit'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
