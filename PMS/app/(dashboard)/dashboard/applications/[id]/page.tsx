'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
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

export default function ApplicationDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [app, setApp] = useState<any>(null)
  const [units, setUnits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Review notes (auto-save on blur)
  const [reviewNotes, setReviewNotes] = useState('')
  const reviewNotesRef = useRef('')

  // Approve modal
  const [showApprove, setShowApprove] = useState(false)
  const [approveForm, setApproveForm] = useState({
    approvedRent: '',
    approvedMoveIn: '',
    unitId: '',
    createDraftLease: true,
  })
  const [approveSaving, setApproveSaving] = useState(false)

  // Deny modal
  const [showDeny, setShowDeny] = useState(false)
  const [denyNotes, setDenyNotes] = useState('')
  const [denySaving, setDenySaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/applications/${params.id}`)
    if (!res.ok) return
    const data = await res.json()
    setApp(data)
    setReviewNotes(data.reviewNotes ?? '')
    reviewNotesRef.current = data.reviewNotes ?? ''
  }, [params.id])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  // Load units when property is known
  useEffect(() => {
    if (!app?.propertyId) return
    fetch(`/api/properties/${app.propertyId}`)
      .then(r => r.json())
      .then(d => {
        setUnits(Array.isArray(d.units) ? d.units : [])
        // Pre-fill approved move-in from application
        setApproveForm(f => ({
          ...f,
          approvedRent: app.unit?.monthlyRent?.toString() ?? '',
          approvedMoveIn: app.desiredMoveIn
            ? new Date(app.desiredMoveIn).toISOString().split('T')[0]
            : '',
          unitId: app.unitId ?? '',
        }))
      })
      .catch(() => {})
  }, [app?.propertyId, app?.unitId, app?.desiredMoveIn, app?.unit?.monthlyRent])

  async function patch(data: any) {
    setSaving(true)
    try {
      const res = await fetch(`/api/applications/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const updated = await res.json()
        setApp(updated)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleReviewNotesSave() {
    if (reviewNotes === reviewNotesRef.current) return
    reviewNotesRef.current = reviewNotes
    await patch({ reviewNotes })
  }

  async function handleStatusChange(status: string) {
    await patch({ status })
  }

  async function handleApprove(e: React.FormEvent) {
    e.preventDefault()
    setApproveSaving(true)
    try {
      const res = await fetch(`/api/applications/${params.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvedRent: Number(approveForm.approvedRent),
          approvedMoveIn: approveForm.approvedMoveIn,
          unitId: approveForm.unitId || undefined,
          createDraftLease: approveForm.createDraftLease,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        router.push(`/dashboard/tenants/${data.tenantId}`)
      }
    } finally {
      setApproveSaving(false)
    }
  }

  async function handleDeny(e: React.FormEvent) {
    e.preventDefault()
    setDenySaving(true)
    try {
      const res = await fetch(`/api/applications/${params.id}/deny`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewNotes: denyNotes }),
      })
      if (res.ok) {
        setShowDeny(false)
        load()
      }
    } finally {
      setDenySaving(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
    </div>
  )

  if (!app) return (
    <div className="py-20 text-center text-gray-400">Application not found.</div>
  )

  const canAct = app.status === 'SUBMITTED' || app.status === 'UNDER_REVIEW'

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/dashboard/applications"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ChevronLeft className="h-4 w-4" /> Back to Applications
      </Link>

      <div className="flex items-start justify-between mb-6">
        <PageHeader
          title={`${app.firstName} ${app.lastName}`}
          subtitle={`Application for ${app.property?.name ?? '—'}`}
        />
        <span
          className={`mt-1 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[app.status] ?? 'bg-gray-100 text-gray-600'}`}
        >
          {STATUS_LABELS[app.status] ?? app.status}
        </span>
      </div>

      {/* Applicant Info */}
      <Card className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Applicant Info</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-gray-400">Email</dt>
            <dd className="text-gray-900">{app.email}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Phone</dt>
            <dd className="text-gray-900">{app.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Employer</dt>
            <dd className="text-gray-900">{app.employer ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Monthly Income</dt>
            <dd className="text-gray-900">
              {app.monthlyIncome ? `$${Number(app.monthlyIncome).toLocaleString()}` : '—'}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-gray-400">Current Address</dt>
            <dd className="text-gray-900">{app.currentAddress ?? '—'}</dd>
          </div>
        </dl>
      </Card>

      {/* Application Details */}
      <Card className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Application Details</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-gray-400">Property</dt>
            <dd className="text-gray-900">{app.property?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Unit</dt>
            <dd className="text-gray-900">
              {app.unit ? `Unit ${app.unit.unitNumber}` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-gray-400">Desired Move-In</dt>
            <dd className="text-gray-900">{formatDate(app.desiredMoveIn)}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Term</dt>
            <dd className="text-gray-900">{app.desiredTerm} months</dd>
          </div>
          {app.notes && (
            <div className="col-span-2">
              <dt className="text-gray-400">Notes</dt>
              <dd className="text-gray-900">{app.notes}</dd>
            </div>
          )}
        </dl>
      </Card>

      {/* Screening */}
      <Card className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Screening</h3>
        <div className="text-sm space-y-2 mb-3">
          {app.reviewedAt && (
            <p className="text-gray-500 text-xs">
              Reviewed {formatDate(app.reviewedAt)}
            </p>
          )}
        </div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Review Notes</label>
        <textarea
          rows={3}
          value={reviewNotes}
          onChange={e => setReviewNotes(e.target.value)}
          onBlur={handleReviewNotesSave}
          disabled={app.status === 'APPROVED' || app.status === 'DENIED' || app.status === 'WITHDRAWN'}
          placeholder="Add screening notes…"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
        />
        {saving && <p className="text-xs text-gray-400 mt-1">Saving…</p>}
      </Card>

      {/* Action buttons */}
      {canAct && (
        <div className="flex flex-wrap gap-2 mb-4">
          {app.status === 'SUBMITTED' && (
            <Button variant="secondary" onClick={() => handleStatusChange('UNDER_REVIEW')}>
              Mark Under Review
            </Button>
          )}
          <Button onClick={() => setShowApprove(true)}>
            Approve
          </Button>
          <Button variant="secondary" onClick={() => setShowDeny(true)}>
            Deny
          </Button>
          <Button variant="secondary" onClick={() => handleStatusChange('WITHDRAWN')}>
            Withdraw
          </Button>
        </div>
      )}
      {app.status === 'WITHDRAWN' && (
        <div className="mb-4">
          <span className="text-sm text-gray-500 italic">This application has been withdrawn.</span>
        </div>
      )}

      {/* Outcome */}
      {app.status === 'APPROVED' && (
        <Card className="border border-green-100 bg-green-50">
          <h3 className="text-sm font-semibold text-green-800 mb-3">Outcome — Approved</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-green-600">Approved Rent</dt>
              <dd className="text-green-900 font-medium">
                {app.approvedRent ? `$${Number(app.approvedRent).toLocaleString()}/mo` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-green-600">Approved Move-In</dt>
              <dd className="text-green-900 font-medium">
                {app.approvedMoveIn ? formatDate(app.approvedMoveIn) : '—'}
              </dd>
            </div>
            {app.tenant?.id && (
              <div className="col-span-2">
                <Link
                  href={`/dashboard/tenants/${app.tenant.id}`}
                  className="text-sm text-blue-600 hover:underline font-medium"
                >
                  View Tenant Profile →
                </Link>
              </div>
            )}
          </dl>
        </Card>
      )}

      {/* Approve Modal */}
      {showApprove && (
        <Modal isOpen={showApprove} title="Approve Application" onClose={() => setShowApprove(false)}>
          <form onSubmit={handleApprove} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Approved Rent ($/mo) *</label>
              <input
                required
                type="number"
                min="0"
                step="any"
                value={approveForm.approvedRent}
                onChange={e => setApproveForm(f => ({ ...f, approvedRent: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Approved Move-In *</label>
              <input
                required
                type="date"
                value={approveForm.approvedMoveIn}
                onChange={e => setApproveForm(f => ({ ...f, approvedMoveIn: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
              <select
                required
                value={approveForm.unitId}
                onChange={e => setApproveForm(f => ({ ...f, unitId: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select unit…</option>
                {units.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    Unit {u.unitNumber} — {u.bedrooms}br/{u.bathrooms}ba — ${u.monthlyRent}/mo
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={approveForm.createDraftLease}
                onChange={e => setApproveForm(f => ({ ...f, createDraftLease: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Create draft lease automatically
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowApprove(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={approveSaving}>
                {approveSaving ? 'Approving…' : 'Approve & Create Tenant'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Deny Modal */}
      {showDeny && (
        <Modal isOpen={showDeny} title="Deny Application" onClose={() => setShowDeny(false)}>
          <form onSubmit={handleDeny} className="space-y-4">
            <p className="text-sm text-gray-600">
              This will permanently deny the application for{' '}
              <strong>{app.firstName} {app.lastName}</strong>. No tenant account will be created.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
              <textarea
                rows={3}
                value={denyNotes}
                onChange={e => setDenyNotes(e.target.value)}
                placeholder="Add denial reason…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowDeny(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={denySaving} className="bg-red-600 hover:bg-red-700 text-white">
                {denySaving ? 'Denying…' : 'Deny Application'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
