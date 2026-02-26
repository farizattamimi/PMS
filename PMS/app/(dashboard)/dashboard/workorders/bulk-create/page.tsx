'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, CheckCircle2, Layers } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface Property { id: string; name: string }
interface Unit     { id: string; unitNumber: string; status: string }

const CATEGORIES = ['PLUMBING', 'HVAC', 'ELECTRICAL', 'GENERAL', 'TURNOVER', 'OTHER']
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']

type Step = 1 | 2 | 3

export default function BulkCreatePage() {
  const router = useRouter()

  // Step data
  const [step, setStep]               = useState<Step>(1)
  const [properties, setProperties]   = useState<Property[]>([])
  const [units, setUnits]             = useState<Unit[]>([])
  const [selectedUnitIds, setSelected] = useState<Set<string>>(new Set())
  const [allUnits, setAllUnits]       = useState(false)

  const [form, setForm] = useState({
    propertyId:  '',
    title:       '',
    description: '',
    category:    'GENERAL',
    priority:    'MEDIUM',
    slaDate:     '',
  })

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult]         = useState<{ created: number } | null>(null)
  const [error, setError]           = useState('')

  // Load properties
  useEffect(() => {
    fetch('/api/properties').then(r => r.json()).then(setProperties)
  }, [])

  // Load units when property changes
  useEffect(() => {
    setUnits([])
    setSelected(new Set())
    setAllUnits(false)
    if (form.propertyId) {
      fetch(`/api/units?propertyId=${form.propertyId}`)
        .then(r => r.json())
        .then(setUnits)
    }
  }, [form.propertyId])

  function toggleUnit(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setAllUnits(false)
  }

  function toggleAll() {
    if (allUnits) {
      setSelected(new Set())
      setAllUnits(false)
    } else {
      setSelected(new Set(units.map(u => u.id)))
      setAllUnits(true)
    }
  }

  async function submit() {
    setSubmitting(true)
    setError('')
    try {
      const unitIds = allUnits ? units.map(u => u.id) : Array.from(selectedUnitIds)
      const res = await fetch('/api/workorders/bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          propertyId: form.propertyId,
          unitIds,
          template: {
            title:       form.title,
            description: form.description,
            category:    form.category,
            priority:    form.priority,
            slaDate:     form.slaDate || undefined,
          },
        }),
      })
      if (!res.ok) {
        const e = await res.json()
        setError(e.error ?? 'Failed to create work orders')
      } else {
        const data = await res.json()
        setResult(data)
        setStep(3)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const selectedProperty = properties.find(p => p.id === form.propertyId)
  const activeUnitIds    = allUnits ? units.map(u => u.id) : Array.from(selectedUnitIds)

  // ── Step indicators ──────────────────────────────────────────────────────────

  const steps = ['Template', 'Units', 'Confirm']

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/dashboard/workorders" className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Work Orders
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <Layers className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bulk Create Work Orders</h1>
          <p className="text-sm text-gray-500">Create the same work order across multiple units at once</p>
        </div>
      </div>

      {/* Step bar */}
      {step < 3 && (
        <div className="flex items-center gap-0 mb-8">
          {steps.map((label, i) => {
            const n = (i + 1) as Step
            const active   = n === step
            const complete  = n < step
            return (
              <div key={label} className="flex items-center">
                <div className={`flex items-center gap-2 text-sm font-medium ${
                  active   ? 'text-blue-600'   :
                  complete ? 'text-green-600'  : 'text-gray-400'
                }`}>
                  <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs border-2 ${
                    active   ? 'border-blue-600 bg-blue-50 text-blue-600'     :
                    complete ? 'border-green-500 bg-green-50 text-green-600'  :
                               'border-gray-300 bg-white text-gray-400'
                  }`}>
                    {complete ? '✓' : n}
                  </span>
                  {label}
                </div>
                {i < steps.length - 1 && (
                  <div className={`mx-3 h-px w-12 ${i + 1 < step ? 'bg-green-400' : 'bg-gray-200'}`} />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Step 1: Template ─────────────────────────────────────────────────── */}
      {step === 1 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">Work Order Template</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.propertyId}
                onChange={e => setForm({ ...form, propertyId: e.target.value })}
                required
              >
                <option value="">Select property…</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. Replace smoke detector batteries"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                rows={3}
                placeholder="Describe the work to be performed…"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={form.priority}
                  onChange={e => setForm({ ...form, priority: e.target.value })}
                >
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SLA Due Date <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="date"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.slaDate}
                onChange={e => setForm({ ...form, slaDate: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end mt-6">
            <Button
              onClick={() => setStep(2)}
              disabled={!form.propertyId || !form.title || !form.description}
            >
              Next: Select Units →
            </Button>
          </div>
        </Card>
      )}

      {/* ── Step 2: Unit Selection ───────────────────────────────────────────── */}
      {step === 2 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Select Units</h2>
          <p className="text-sm text-gray-500 mb-5">
            Choose which units to create a work order for. Leave all unchecked to create one property-wide order.
          </p>

          {units.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No units found for this property.</p>
          ) : (
            <>
              {/* Select all */}
              <label className="flex items-center gap-2 mb-3 cursor-pointer border-b pb-3">
                <input
                  type="checkbox"
                  checked={allUnits}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm font-medium text-gray-700">
                  Select all units ({units.length})
                </span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
                {units.map(u => (
                  <label
                    key={u.id}
                    className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedUnitIds.has(u.id) || allUnits
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedUnitIds.has(u.id) || allUnits}
                      onChange={() => { if (!allUnits) toggleUnit(u.id) }}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900">Unit {u.unitNumber}</span>
                      <span className={`ml-1.5 text-[10px] ${
                        u.status === 'AVAILABLE' ? 'text-gray-400' :
                        u.status === 'OCCUPIED'  ? 'text-green-600' : 'text-orange-500'
                      }`}>
                        {u.status}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}

          <div className="flex items-center justify-between mt-6">
            <Button variant="ghost" onClick={() => setStep(1)}>
              ← Back
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                {activeUnitIds.length === 0
                  ? '1 property-wide WO'
                  : `${activeUnitIds.length} WO${activeUnitIds.length !== 1 ? 's' : ''} will be created`
                }
              </span>
              <Button onClick={() => setStep(3 as Step)}>
                Review & Submit →
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Step 3: Review / Success ─────────────────────────────────────────── */}
      {step === 3 && !result && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">Review</h2>

          <dl className="space-y-3 text-sm mb-6">
            <div className="flex gap-2">
              <dt className="w-32 text-gray-500 flex-shrink-0">Property</dt>
              <dd className="font-medium">{selectedProperty?.name}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 text-gray-500 flex-shrink-0">Title</dt>
              <dd className="font-medium">{form.title}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 text-gray-500 flex-shrink-0">Description</dt>
              <dd className="text-gray-700">{form.description}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 text-gray-500 flex-shrink-0">Category</dt>
              <dd>{form.category}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 text-gray-500 flex-shrink-0">Priority</dt>
              <dd>{form.priority}</dd>
            </div>
            {form.slaDate && (
              <div className="flex gap-2">
                <dt className="w-32 text-gray-500 flex-shrink-0">SLA Due</dt>
                <dd>{form.slaDate}</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="w-32 text-gray-500 flex-shrink-0">Units</dt>
              <dd>
                {activeUnitIds.length === 0
                  ? 'Property-wide (no specific unit)'
                  : `${activeUnitIds.length} unit${activeUnitIds.length !== 1 ? 's' : ''}`
                }
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 text-gray-500 flex-shrink-0">WOs to create</dt>
              <dd className="font-semibold text-blue-700">
                {activeUnitIds.length === 0 ? 1 : activeUnitIds.length}
              </dd>
            </div>
          </dl>

          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>
              ← Back
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Work Orders'}
            </Button>
          </div>
        </Card>
      )}

      {/* ── Success ──────────────────────────────────────────────────────────── */}
      {step === 3 && result && (
        <Card className="p-10 text-center">
          <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {result.created} Work Order{result.created !== 1 ? 's' : ''} Created!
          </h2>
          <p className="text-gray-500 mb-6">
            All work orders have been created with status <strong>NEW</strong>.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/dashboard/workorders">
              <Button variant="ghost">View Work Orders</Button>
            </Link>
            <Button onClick={() => {
              setStep(1)
              setResult(null)
              setForm({ propertyId: '', title: '', description: '', category: 'GENERAL', priority: 'MEDIUM', slaDate: '' })
              setSelected(new Set())
            }}>
              Create More
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
