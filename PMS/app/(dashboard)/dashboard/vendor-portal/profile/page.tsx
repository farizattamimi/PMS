'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Star, Building2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface VendorProfile {
  id: string
  name: string
  email: string | null
  phone: string | null
  serviceCategories: string[]
  status: string
  licenseNumber: string | null
  licenseExpiry: string | null
  insuranceCarrier: string | null
  insuranceExpiry: string | null
  insuranceAmount: number | null
  w9OnFile: boolean
  performanceScore: number | null
  reviewCount: number
  propertyVendors: { property: { id: string; name: string } }[]
  _count: { workOrders: number; reviews: number }
}

function expiryClass(dateStr: string | null): string {
  if (!dateStr) return 'text-gray-400'
  const d = new Date(dateStr)
  const days = (d.getTime() - Date.now()) / 86400000
  if (days < 0)  return 'text-red-600 font-semibold'
  if (days < 90) return 'text-orange-500 font-semibold'
  return 'text-gray-700'
}

export default function VendorProfilePage() {
  const [profile, setProfile] = useState<VendorProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError]     = useState('')

  const [form, setForm] = useState({
    phone:            '',
    licenseNumber:    '',
    licenseExpiry:    '',
    insuranceCarrier: '',
    insuranceExpiry:  '',
    insuranceAmount:  '',
    w9OnFile:         false,
  })

  async function load() {
    const res = await fetch('/api/vendor-portal/profile')
    if (res.ok) {
      const data: VendorProfile = await res.json()
      setProfile(data)
      setForm({
        phone:            data.phone            ?? '',
        licenseNumber:    data.licenseNumber    ?? '',
        licenseExpiry:    data.licenseExpiry    ? data.licenseExpiry.slice(0, 10) : '',
        insuranceCarrier: data.insuranceCarrier ?? '',
        insuranceExpiry:  data.insuranceExpiry  ? data.insuranceExpiry.slice(0, 10)  : '',
        insuranceAmount:  data.insuranceAmount  != null ? String(data.insuranceAmount) : '',
        w9OnFile:         data.w9OnFile,
      })
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(''); setSuccess('')
    const res = await fetch('/api/vendor-portal/profile', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        phone:            form.phone            || null,
        licenseNumber:    form.licenseNumber    || null,
        licenseExpiry:    form.licenseExpiry    || null,
        insuranceCarrier: form.insuranceCarrier || null,
        insuranceExpiry:  form.insuranceExpiry  || null,
        insuranceAmount:  form.insuranceAmount  ? Number(form.insuranceAmount) : null,
        w9OnFile:         form.w9OnFile,
      }),
    })
    if (res.ok) {
      await load()
      setEditing(false)
      setSuccess('Profile updated.')
    } else {
      const e = await res.json()
      setError(e.error ?? 'Failed to save')
    }
    setSaving(false)
  }

  if (loading) return <div className="p-6 text-gray-400">Loading…</div>
  if (!profile) return <div className="p-6 text-red-600">Profile not found.</div>

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/dashboard/vendor-portal" className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Vendor Portal
        </Link>
      </div>

      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{profile.name}</h1>
          <p className="text-sm text-gray-500">{profile.email}</p>
        </div>
        <div className="flex items-center gap-2">
          {profile.performanceScore != null && (
            <div className="flex items-center gap-1 text-yellow-500">
              <Star className="h-4 w-4 fill-yellow-400" />
              <span className="font-semibold text-sm text-gray-700">{profile.performanceScore.toFixed(1)}</span>
              <span className="text-xs text-gray-400">({profile.reviewCount} reviews)</span>
            </div>
          )}
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${profile.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {profile.status}
          </span>
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{profile._count.workOrders}</p>
          <p className="text-xs text-gray-500">Work Orders</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{profile._count.reviews}</p>
          <p className="text-xs text-gray-500">Reviews</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{profile.propertyVendors.length}</p>
          <p className="text-xs text-gray-500">Properties</p>
        </Card>
      </div>

      {/* Service categories */}
      <Card className="p-5 mb-5">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Service Categories</h2>
        <div className="flex flex-wrap gap-2">
          {profile.serviceCategories.length === 0 ? (
            <p className="text-sm text-gray-400">No categories assigned.</p>
          ) : (
            profile.serviceCategories.map(c => (
              <span key={c} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                {c}
              </span>
            ))
          )}
        </div>
      </Card>

      {/* Assigned properties */}
      {profile.propertyVendors.length > 0 && (
        <Card className="p-5 mb-5">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Assigned Properties</h2>
          <div className="space-y-1.5">
            {profile.propertyVendors.map(pv => (
              <div key={pv.property.id} className="flex items-center gap-2 text-sm text-gray-700">
                <Building2 className="h-4 w-4 text-gray-400" />
                {pv.property.name}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Credentials */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Credentials & Compliance</h2>
          {!editing && (
            <Button size="sm" variant="ghost" onClick={() => { setEditing(true); setSuccess('') }}>
              Edit
            </Button>
          )}
        </div>

        {success && <p className="text-sm text-green-600 mb-3">{success}</p>}
        {error   && <p className="text-sm text-red-600 mb-3">{error}</p>}

        {!editing ? (
          <dl className="space-y-3 text-sm">
            {[
              { label: 'Phone',              value: profile.phone },
              { label: 'License #',          value: profile.licenseNumber },
              { label: 'License Expiry',     value: profile.licenseExpiry  ? new Date(profile.licenseExpiry).toLocaleDateString()  : null, cls: expiryClass(profile.licenseExpiry) },
              { label: 'Insurance Carrier',  value: profile.insuranceCarrier },
              { label: 'Insurance Expiry',   value: profile.insuranceExpiry ? new Date(profile.insuranceExpiry).toLocaleDateString() : null, cls: expiryClass(profile.insuranceExpiry) },
              { label: 'Insurance Amount',   value: profile.insuranceAmount != null ? `$${profile.insuranceAmount.toLocaleString()}` : null },
              { label: 'W-9 On File',        value: profile.w9OnFile ? 'Yes' : 'No', cls: profile.w9OnFile ? 'text-green-600' : 'text-orange-500' },
            ].map(row => (
              <div key={row.label} className="flex gap-2">
                <dt className="w-40 text-gray-400 flex-shrink-0">{row.label}</dt>
                <dd className={row.cls ?? 'text-gray-900'}>{row.value ?? <span className="text-gray-300">—</span>}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">License #</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.licenseNumber} onChange={e => setForm({...form, licenseNumber: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">License Expiry</label>
                <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.licenseExpiry} onChange={e => setForm({...form, licenseExpiry: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Insurance Carrier</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.insuranceCarrier} onChange={e => setForm({...form, insuranceCarrier: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Insurance Expiry</label>
                <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.insuranceExpiry} onChange={e => setForm({...form, insuranceExpiry: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Insurance Amount ($)</label>
                <input type="number" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.insuranceAmount} onChange={e => setForm({...form, insuranceAmount: e.target.value})} />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input type="checkbox" id="w9" checked={form.w9OnFile} onChange={e => setForm({...form, w9OnFile: e.target.checked})} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                <label htmlFor="w9" className="text-sm font-medium text-gray-700">W-9 On File</label>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}
