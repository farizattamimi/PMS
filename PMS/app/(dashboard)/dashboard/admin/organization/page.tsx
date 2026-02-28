'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'

const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function OrganizationSettingsPage() {
  const [form, setForm] = useState({
    name: '',
    logoUrl: '',
    primaryColor: '',
    accentColor: '',
    domain: '',
    supportEmail: '',
    supportPhone: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/org/settings')
      .then(r => r.json())
      .then(data => {
        setForm({
          name: data.name ?? '',
          logoUrl: data.logoUrl ?? '',
          primaryColor: data.primaryColor ?? '',
          accentColor: data.accentColor ?? '',
          domain: data.domain ?? '',
          supportEmail: data.supportEmail ?? '',
          supportPhone: data.supportPhone ?? '',
        })
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    await fetch('/api/org/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>

  return (
    <div>
      <PageHeader title="Organization Settings" subtitle="Manage branding and contact information" />

      <form onSubmit={handleSave} className="max-w-2xl space-y-6">
        {/* General */}
        <Card>
          <CardHeader><CardTitle>General</CardTitle></CardHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
              <input className={INPUT_CLS} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Custom Domain</label>
              <input className={INPUT_CLS} placeholder="e.g. manage.yourcompany.com" value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} />
            </div>
          </div>
        </Card>

        {/* Branding */}
        <Card>
          <CardHeader><CardTitle>Branding</CardTitle></CardHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
              <input className={INPUT_CLS} placeholder="https://..." value={form.logoUrl} onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))} />
              {form.logoUrl && (
                <div className="mt-2 p-2 bg-gray-50 rounded-lg inline-block">
                  <img src={form.logoUrl} alt="Logo preview" className="h-10 object-contain" />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={form.primaryColor || '#2563eb'}
                    onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
                    className="h-9 w-12 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    className={INPUT_CLS}
                    placeholder="#2563eb"
                    value={form.primaryColor}
                    onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Accent Color</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={form.accentColor || '#7c3aed'}
                    onChange={e => setForm(f => ({ ...f, accentColor: e.target.value }))}
                    className="h-9 w-12 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    className={INPUT_CLS}
                    placeholder="#7c3aed"
                    value={form.accentColor}
                    onChange={e => setForm(f => ({ ...f, accentColor: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            {/* Preview */}
            <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
              <span className="text-xs text-gray-500">Preview:</span>
              <div
                className="h-8 w-8 rounded"
                style={{ backgroundColor: form.primaryColor || '#2563eb' }}
              />
              <div
                className="h-8 w-8 rounded"
                style={{ backgroundColor: form.accentColor || '#7c3aed' }}
              />
              <span className="text-sm font-medium" style={{ color: form.primaryColor || '#2563eb' }}>{form.name || 'PMS'}</span>
            </div>
          </div>
        </Card>

        {/* Contact */}
        <Card>
          <CardHeader><CardTitle>Support Contact</CardTitle></CardHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Support Email</label>
              <input className={INPUT_CLS} type="email" placeholder="support@yourcompany.com" value={form.supportEmail} onChange={e => setForm(f => ({ ...f, supportEmail: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Support Phone</label>
              <input className={INPUT_CLS} type="tel" placeholder="+1 555-0100" value={form.supportPhone} onChange={e => setForm(f => ({ ...f, supportPhone: e.target.value }))} />
            </div>
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save Settings'}
          </Button>
          {saved && <span className="text-sm text-green-600 font-medium">Settings saved!</span>}
        </div>
      </form>
    </div>
  )
}
