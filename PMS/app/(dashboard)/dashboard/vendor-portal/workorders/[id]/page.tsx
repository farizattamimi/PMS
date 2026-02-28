'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, AlertTriangle, CheckCircle, Play, PauseCircle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { WorkOrderPriorityBadge, WorkOrderStatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { formatDate } from '@/lib/utils'
import PhotoUploader from '@/components/ui/PhotoUploader'

interface WorkOrder {
  id: string
  title: string
  description: string
  status: string
  priority: string
  category: string
  slaDate: string | null
  signOffNotes: string | null
  completedAt: string | null
  createdAt: string
  property: { name: string; address: string }
  unit: { unitNumber: string } | null
  costs: { costType: string; memo: string | null; amount: number; createdAt: string }[]
}

type Transition = 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED'

const TRANSITIONS: Record<string, { label: string; to: Transition; icon: React.ComponentType<{className?:string}>; variant: 'primary' | 'danger' | 'secondary' }[]> = {
  ASSIGNED:    [{ label: 'Start Work',     to: 'IN_PROGRESS', icon: Play,         variant: 'primary'   }],
  IN_PROGRESS: [{ label: 'Mark Complete',  to: 'COMPLETED',   icon: CheckCircle,  variant: 'primary'   },
                { label: 'Add Block',      to: 'BLOCKED',     icon: PauseCircle,  variant: 'secondary' }],
  BLOCKED:     [{ label: 'Resume Work',    to: 'IN_PROGRESS', icon: Play,         variant: 'primary'   }],
}

export default function VendorWODetailPage({ params }: { params: { id: string } }) {
  const [wo, setWo]           = useState<WorkOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const [documents, setDocuments] = useState<any[]>([])

  const loadDocs = useCallback(async () => {
    const res = await fetch(`/api/documents?scopeType=workorder&scopeId=${params.id}`)
    const data = await res.json()
    setDocuments(Array.isArray(data) ? data : [])
  }, [params.id])

  const load = useCallback(async () => {
    const res = await fetch(`/api/vendor-portal/workorders/${params.id}`)
    if (res.ok) {
      const data = await res.json()
      setWo(data)
      setNotes(data.signOffNotes ?? '')
    }
    setLoading(false)
  }, [params.id])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadDocs() }, [loadDocs])

  async function transition(to: Transition) {
    setSaving(true); setError(''); setSuccess('')
    const body: Record<string, unknown> = { status: to }
    if (to === 'COMPLETED' && notes) body.signOffNotes = notes

    const res = await fetch(`/api/vendor-portal/workorders/${params.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    if (res.ok) {
      const updated = await res.json()
      setWo(updated)
      setNotes(updated.signOffNotes ?? '')
      setSuccess(`Status updated to ${to.replace('_', ' ')}`)
    } else {
      const e = await res.json()
      setError(e.error ?? 'Failed to update')
    }
    setSaving(false)
  }

  async function saveNotes() {
    setSaving(true); setError(''); setSuccess('')
    const res = await fetch(`/api/vendor-portal/workorders/${params.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ signOffNotes: notes }),
    })
    if (res.ok) { setSuccess('Notes saved.') }
    else { const e = await res.json(); setError(e.error ?? 'Error') }
    setSaving(false)
  }

  if (loading) return <div className="p-6 text-gray-400">Loading…</div>
  if (!wo)     return <div className="p-6 text-red-600">Work order not found.</div>

  const isOverdue = wo.slaDate && new Date(wo.slaDate) < new Date() && !['COMPLETED','CANCELED'].includes(wo.status)
  const available = TRANSITIONS[wo.status] ?? []
  const isTerminal = ['COMPLETED','CANCELED'].includes(wo.status)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/dashboard/vendor-portal/workorders" className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Work Orders
        </Link>
      </div>

      {/* Header */}
      <Card className="p-5 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <WorkOrderStatusBadge status={wo.status} />
              <WorkOrderPriorityBadge priority={wo.priority} />
              <span className="text-xs font-mono text-gray-400">{wo.category}</span>
              {isOverdue && (
                <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                  <AlertTriangle className="h-3 w-3" /> SLA overdue
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{wo.title}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {wo.property.name}
              {wo.unit && ` · Unit ${wo.unit.unitNumber}`}
            </p>
          </div>
          <div className="text-right text-sm text-gray-400">
            <p>Created {formatDate(wo.createdAt)}</p>
            {wo.slaDate && (
              <p className={`mt-1 ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
                SLA due {new Date(wo.slaDate).toLocaleDateString()}
              </p>
            )}
            {wo.completedAt && (
              <p className="mt-1 text-green-600">Completed {formatDate(wo.completedAt)}</p>
            )}
          </div>
        </div>

        <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">
          {wo.description}
        </div>
      </Card>

      {/* Status actions */}
      {!isTerminal && available.length > 0 && (
        <Card className="p-5 mb-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Update Status</h2>

          {/* Notes field shown when completing */}
          {wo.status === 'IN_PROGRESS' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes / Sign-off remarks <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                rows={3}
                placeholder="Describe work performed, materials used, etc."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
              <button
                onClick={saveNotes}
                disabled={saving}
                className="mt-1 text-xs text-blue-600 hover:underline"
              >
                {saving ? 'Saving…' : 'Save notes'}
              </button>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            {available.map(t => (
              <Button
                key={t.to}
                variant={t.variant}
                onClick={() => transition(t.to)}
                disabled={saving}
              >
                <t.icon className="h-4 w-4 mr-1.5" />
                {t.label}
              </Button>
            ))}
          </div>

          {error   && <p className="mt-3 text-sm text-red-600">{error}</p>}
          {success && <p className="mt-3 text-sm text-green-600">{success}</p>}
        </Card>
      )}

      {/* Sign-off notes (read-only for completed) */}
      {isTerminal && wo.signOffNotes && (
        <Card className="p-5 mb-5">
          <h2 className="text-base font-semibold text-gray-900 mb-2">Sign-off Notes</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{wo.signOffNotes}</p>
        </Card>
      )}

      {/* Photos & Attachments */}
      <Card className="p-5 mb-5">
        <PhotoUploader
          workOrderId={wo.id}
          documents={documents}
          onUploadComplete={loadDocs}
        />
      </Card>

      {/* Costs */}
      {wo.costs.length > 0 && (
        <Card className="p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Cost Records</h2>
          <div className="space-y-2">
            {wo.costs.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                <span className="text-gray-700">{c.memo ?? c.costType}</span>
                <span className="font-medium text-gray-900">${c.amount.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-sm font-semibold pt-1">
              <span>Total</span>
              <span>${wo.costs.reduce((s, c) => s + c.amount, 0).toFixed(2)}</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
