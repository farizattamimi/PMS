'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, CheckCircle, XCircle, Star, Wand2, KeyRound } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { WorkOrderStatusBadge } from '@/components/ui/Badge'
import { formatDate, formatCurrency } from '@/lib/utils'

const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function CredBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-sm ${ok ? 'text-green-700' : 'text-red-600'}`}>
      {ok ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {label}
    </div>
  )
}

export default function VendorDetailPage() {
  const { id } = useParams()
  const [vendor, setVendor] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [credForm, setCredForm] = useState({
    licenseNumber: '',
    licenseExpiry: '',
    insuranceCarrier: '',
    insuranceExpiry: '',
    insuranceAmount: '',
    w9OnFile: false,
  })
  const [saving, setSaving] = useState(false)

  // Portal invite
  const [showInvite, setShowInvite]     = useState(false)
  const [inviteForm, setInviteForm]     = useState({ name: '', email: '', password: '' })
  const [inviteSaving, setInviteSaving] = useState(false)
  const [inviteError, setInviteError]   = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteSaving(true); setInviteError(''); setInviteSuccess('')
    const res = await fetch(`/api/vendors/${id}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inviteForm),
    })
    const data = await res.json()
    if (res.ok) {
      setInviteSuccess(`Portal account created for ${data.email}`)
      setInviteForm({ name: '', email: '', password: '' })
      load()
    } else {
      setInviteError(data.error ?? 'Failed to create account')
    }
    setInviteSaving(false)
  }

  async function handleRevokeAccess() {
    if (!confirm('Remove portal access for this vendor?')) return
    await fetch(`/api/vendors/${id}/invite`, { method: 'DELETE' })
    load()
  }

  // AI vendor narrative
  const [vendorNarrative, setVendorNarrative] = useState('')
  const [generatingNarrative, setGeneratingNarrative] = useState(false)

  async function handleGenerateNarrative() {
    setGeneratingNarrative(true)
    setVendorNarrative('')
    const res = await fetch('/api/ai/vendor-narrative', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId: id }),
    })
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      setVendorNarrative(t => t + dec.decode(value, { stream: true }))
    }
    setGeneratingNarrative(false)
  }

  const load = useCallback(async () => {
    const res = await fetch(`/api/vendors/${id}`)
    const data = await res.json()
    setVendor(data)
    setCredForm({
      licenseNumber: data.licenseNumber ?? '',
      licenseExpiry: data.licenseExpiry ? data.licenseExpiry.slice(0, 10) : '',
      insuranceCarrier: data.insuranceCarrier ?? '',
      insuranceExpiry: data.insuranceExpiry ? data.insuranceExpiry.slice(0, 10) : '',
      insuranceAmount: data.insuranceAmount != null ? String(data.insuranceAmount) : '',
      w9OnFile: data.w9OnFile ?? false,
    })
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleSaveCreds(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch(`/api/vendors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseNumber: credForm.licenseNumber || null,
        licenseExpiry: credForm.licenseExpiry || null,
        insuranceCarrier: credForm.insuranceCarrier || null,
        insuranceExpiry: credForm.insuranceExpiry || null,
        insuranceAmount: credForm.insuranceAmount ? parseFloat(credForm.insuranceAmount) : null,
        w9OnFile: credForm.w9OnFile,
      }),
    })
    setSaving(false)
    setEditing(false)
    load()
  }

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
  if (!vendor || vendor.error) return <div className="text-center py-20 text-gray-500">Vendor not found.</div>

  const now = new Date()
  const licenseOk = vendor.licenseNumber && vendor.licenseExpiry && new Date(vendor.licenseExpiry) > now
  const insuranceOk = vendor.insuranceCarrier && vendor.insuranceExpiry && new Date(vendor.insuranceExpiry) > now
  const w9Ok = vendor.w9OnFile

  const licenseExpiringSoon = vendor.licenseExpiry && new Date(vendor.licenseExpiry) > now && new Date(vendor.licenseExpiry) <= new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
  const insuranceExpiringSoon = vendor.insuranceExpiry && new Date(vendor.insuranceExpiry) > now && new Date(vendor.insuranceExpiry) <= new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)

  return (
    <div>
      <Link href="/dashboard/vendors" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="h-4 w-4" /> Back to Vendors
      </Link>
      <PageHeader
        title={vendor.name}
        subtitle={[vendor.email, vendor.phone].filter(Boolean).join(' · ')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Credentialing */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Credentialing</h3>
              <button onClick={() => setEditing(!editing)} className="text-sm text-blue-600 hover:underline">
                {editing ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {!editing ? (
              <div className="space-y-3">
                <CredBadge ok={!!licenseOk} label={vendor.licenseNumber ? `License: ${vendor.licenseNumber}` : 'No license on file'} />
                {vendor.licenseExpiry && (
                  <p className={`text-xs ml-6 ${licenseExpiringSoon ? 'text-orange-600 font-medium' : 'text-gray-400'}`}>
                    Expires {formatDate(vendor.licenseExpiry)}{licenseExpiringSoon ? ' — expiring soon' : ''}
                  </p>
                )}
                <CredBadge ok={!!insuranceOk} label={vendor.insuranceCarrier ? `Insurance: ${vendor.insuranceCarrier}` : 'No insurance on file'} />
                {vendor.insuranceExpiry && (
                  <p className={`text-xs ml-6 ${insuranceExpiringSoon ? 'text-orange-600 font-medium' : 'text-gray-400'}`}>
                    Expires {formatDate(vendor.insuranceExpiry)}{insuranceExpiringSoon ? ' — expiring soon' : ''}
                  </p>
                )}
                {vendor.insuranceAmount && (
                  <p className="text-xs ml-6 text-gray-400">Coverage: {formatCurrency(vendor.insuranceAmount)}</p>
                )}
                <CredBadge ok={w9Ok} label={w9Ok ? 'W-9 on file' : 'W-9 missing'} />
              </div>
            ) : (
              <form onSubmit={handleSaveCreds} className="space-y-3">
                <div><label className="block text-xs font-medium text-gray-700 mb-1">License Number</label><input className={INPUT_CLS} value={credForm.licenseNumber} onChange={e => setCredForm({ ...credForm, licenseNumber: e.target.value })} /></div>
                <div><label className="block text-xs font-medium text-gray-700 mb-1">License Expiry</label><input type="date" className={INPUT_CLS} value={credForm.licenseExpiry} onChange={e => setCredForm({ ...credForm, licenseExpiry: e.target.value })} /></div>
                <div><label className="block text-xs font-medium text-gray-700 mb-1">Insurance Carrier</label><input className={INPUT_CLS} value={credForm.insuranceCarrier} onChange={e => setCredForm({ ...credForm, insuranceCarrier: e.target.value })} /></div>
                <div><label className="block text-xs font-medium text-gray-700 mb-1">Insurance Expiry</label><input type="date" className={INPUT_CLS} value={credForm.insuranceExpiry} onChange={e => setCredForm({ ...credForm, insuranceExpiry: e.target.value })} /></div>
                <div><label className="block text-xs font-medium text-gray-700 mb-1">Insurance Amount ($)</label><input type="number" className={INPUT_CLS} value={credForm.insuranceAmount} onChange={e => setCredForm({ ...credForm, insuranceAmount: e.target.value })} /></div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="w9" checked={credForm.w9OnFile} onChange={e => setCredForm({ ...credForm, w9OnFile: e.target.checked })} className="rounded" />
                  <label htmlFor="w9" className="text-sm text-gray-700">W-9 on file</label>
                </div>
                <Button type="submit" disabled={saving} className="w-full justify-center">{saving ? 'Saving…' : 'Save'}</Button>
              </form>
            )}
          </Card>

          {/* Performance score */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">Performance</h3>
            {vendor.performanceScore != null ? (
              <div className="flex items-center gap-3">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} className={`h-5 w-5 ${s <= Math.round(vendor.performanceScore) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
                  ))}
                </div>
                <span className="text-lg font-bold">{vendor.performanceScore.toFixed(1)}</span>
                <span className="text-sm text-gray-400">({vendor.reviewCount} review{vendor.reviewCount !== 1 ? 's' : ''})</span>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No reviews yet.</p>
            )}
          </Card>

          {/* AI Performance Summary */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">AI Performance Summary</h3>
              <button
                onClick={handleGenerateNarrative}
                disabled={generatingNarrative}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50"
              >
                <Wand2 className="h-3 w-3" />
                {generatingNarrative ? 'Generating…' : 'Generate Summary'}
              </button>
            </div>
            {!vendorNarrative && !generatingNarrative && (
              <p className="text-xs text-gray-400">Click to generate an AI narrative based on reviews and work order history.</p>
            )}
            {generatingNarrative && !vendorNarrative && (
              <p className="text-sm text-gray-400"><span className="animate-pulse">…</span></p>
            )}
            {vendorNarrative && (
              <p className="text-sm text-gray-600 leading-relaxed">
                {vendorNarrative}
                {generatingNarrative && <span className="animate-pulse">…</span>}
              </p>
            )}
          </Card>

          {/* Portal Access */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Portal Access</h3>
              <KeyRound className="h-4 w-4 text-gray-400" />
            </div>
            {vendor.userId ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle className="h-4 w-4" />
                  Portal account active
                </div>
                <button
                  onClick={handleRevokeAccess}
                  className="text-xs text-red-500 hover:underline"
                >
                  Revoke access
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-400">No portal account yet.</p>
                <Button size="sm" onClick={() => {
                  setInviteForm({ name: vendor.name, email: vendor.email ?? '', password: '' })
                  setInviteError(''); setInviteSuccess(''); setShowInvite(true)
                }}>
                  Invite to Portal
                </Button>
              </div>
            )}
            {inviteSuccess && <p className="text-xs text-green-600 mt-2">{inviteSuccess}</p>}
          </Card>

          {/* Properties */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">Assigned Properties</h3>
            <div className="space-y-1">
              {vendor.propertyVendors?.map((pv: any) => (
                <Link key={pv.property.id} href={`/dashboard/properties/${pv.property.id}`} className="block text-sm text-blue-600 hover:underline">{pv.property.name}</Link>
              ))}
              {vendor.propertyVendors?.length === 0 && <p className="text-sm text-gray-400">No properties linked.</p>}
            </div>
          </Card>
        </div>

        {/* Right: Work orders + Reviews */}
        <div className="lg:col-span-2 space-y-6">
          <Card padding="none">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Recent Work Orders</h3>
            </div>
            <Table>
              <TableHead><TableRow><TableHeader>Title</TableHeader><TableHeader>Property</TableHeader><TableHeader>Status</TableHeader><TableHeader>Date</TableHeader></TableRow></TableHead>
              <TableBody>
                {(vendor.workOrders ?? []).length === 0 && <TableEmptyState message="No work orders." />}
                {(vendor.workOrders ?? []).map((wo: any) => (
                  <TableRow key={wo.id}>
                    <TableCell><Link href={`/dashboard/workorders/${wo.id}`} className="text-sm font-medium text-blue-600 hover:underline">{wo.title}</Link></TableCell>
                    <TableCell className="text-gray-500 text-sm">{wo.property?.name}</TableCell>
                    <TableCell><WorkOrderStatusBadge status={wo.status} /></TableCell>
                    <TableCell className="text-gray-400 text-sm">{formatDate(wo.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <Card padding="none">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Reviews</h3>
            </div>
            <Table>
              <TableHead><TableRow><TableHeader>Work Order</TableHeader><TableHeader>Score</TableHeader><TableHeader>Quality</TableHeader><TableHeader>Response Time</TableHeader><TableHeader>Notes</TableHeader><TableHeader>Date</TableHeader></TableRow></TableHead>
              <TableBody>
                {(vendor.reviews ?? []).length === 0 && <TableEmptyState message="No reviews yet." />}
                {(vendor.reviews ?? []).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm"><Link href={`/dashboard/workorders/${r.workOrderId}`} className="text-blue-600 hover:underline">{r.workOrder?.title}</Link></TableCell>
                    <TableCell>
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star key={s} className={`h-3.5 w-3.5 ${s <= r.score ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">{r.quality}/5</TableCell>
                    <TableCell className="text-sm text-gray-500">{r.responseTime != null ? `${r.responseTime}h` : '—'}</TableCell>
                    <TableCell className="text-xs text-gray-500 max-w-[160px] truncate">{r.notes ?? '—'}</TableCell>
                    <TableCell className="text-gray-400 text-sm">{formatDate(r.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      </div>

      {/* Invite modal */}
      <Modal isOpen={showInvite} onClose={() => setShowInvite(false)} title="Invite Vendor to Portal">
        <form onSubmit={handleInvite} className="space-y-4">
          <p className="text-sm text-gray-500">
            Create a login account for this vendor. They will be able to view and update their assigned work orders.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input className={INPUT_CLS} value={inviteForm.name} onChange={e => setInviteForm({...inviteForm, name: e.target.value})} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email (login)</label>
            <input type="email" className={INPUT_CLS} value={inviteForm.email} onChange={e => setInviteForm({...inviteForm, email: e.target.value})} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password</label>
            <input type="password" className={INPUT_CLS} value={inviteForm.password} onChange={e => setInviteForm({...inviteForm, password: e.target.value})} minLength={8} required />
            <p className="text-xs text-gray-400 mt-1">Minimum 8 characters. Share securely with the vendor.</p>
          </div>
          {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button type="submit" disabled={inviteSaving}>{inviteSaving ? 'Creating…' : 'Create Portal Account'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
