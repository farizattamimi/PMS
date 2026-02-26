'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Star } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'

export default function VendorsPage() {
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', serviceCategories: [] as string[] })
  const [saving, setSaving] = useState(false)

  const CATEGORIES = ['PLUMBING','HVAC','ELECTRICAL','GENERAL','TURNOVER','OTHER']

  async function load() {
    const res = await fetch('/api/vendors')
    setVendors(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function toggleCategory(cat: string) {
    setForm(f => ({ ...f, serviceCategories: f.serviceCategories.includes(cat) ? f.serviceCategories.filter(c => c !== cat) : [...f.serviceCategories, cat] }))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    await fetch('/api/vendors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false); setShowModal(false); setForm({ name: '', email: '', phone: '', serviceCategories: [] }); load()
  }

  async function toggleStatus(vendor: any) {
    const status = vendor.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    await fetch(`/api/vendors/${vendor.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    load()
  }

  return (
    <div>
      <PageHeader title="Vendors" subtitle="Contractor and vendor directory" action={<Button onClick={() => setShowModal(true)}><Plus className="h-4 w-4 mr-2" /> Add Vendor</Button>} />

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendors.map(v => {
            const now = new Date()
            const licenseWarn = v.licenseExpiry && new Date(v.licenseExpiry) <= new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
            const insuranceWarn = v.insuranceExpiry && new Date(v.insuranceExpiry) <= new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
            return (
              <Card key={v.id}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <Link href={`/dashboard/vendors/${v.id}`} className="font-semibold text-gray-900 hover:text-blue-600">{v.name}</Link>
                    {v.email && <p className="text-sm text-gray-500">{v.email}</p>}
                    {v.phone && <p className="text-sm text-gray-500">{v.phone}</p>}
                  </div>
                  <Badge variant={v.status === 'ACTIVE' ? 'success' : 'gray'}>{v.status}</Badge>
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {(v.serviceCategories ?? []).map((c: string) => (
                    <Badge key={c} variant="info" className="text-xs">{c}</Badge>
                  ))}
                </div>
                {/* Credential alerts */}
                {(licenseWarn || insuranceWarn) && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {licenseWarn && <Badge variant="warning" className="text-xs">License expiring</Badge>}
                    {insuranceWarn && <Badge variant="warning" className="text-xs">Insurance expiring</Badge>}
                  </div>
                )}
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <span>{v._count?.workOrders ?? 0} WOs</span>
                    {v.performanceScore != null && (
                      <span className="flex items-center gap-0.5 text-yellow-600">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        {v.performanceScore.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <button onClick={() => toggleStatus(v)} className="text-xs text-gray-400 hover:text-gray-600 hover:underline">
                    {v.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </Card>
            )
          })}
          {vendors.length === 0 && <p className="text-gray-500 col-span-full text-center py-12">No vendors yet. Add your first vendor.</p>}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Vendor">
        <form onSubmit={handleCreate} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone</label><input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Service Categories</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <button key={c} type="button" onClick={() => toggleCategory(c)} className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${form.serviceCategories.includes(c) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'}`}>{c}</button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Vendor'}</Button></div>
        </form>
      </Modal>
    </div>
  )
}
