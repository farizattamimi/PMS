'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { DoorOpen, Wrench, TrendingUp, AlertTriangle, Clock, Home, CreditCard, Plus, FileText, ExternalLink, X, Paperclip, Wand2, Camera, Trash2 } from 'lucide-react'
import { StatsCard } from '@/components/ui/StatsCard'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { WorkOrderPriorityBadge, WorkOrderStatusBadge, PropertyStatusBadge, LeaseStatusBadge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/layout/PageHeader'
import { formatCurrency, formatDate } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

// ── Manager / Admin dashboard ──────────────────────────────────────────────

function ManagerDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [aiInsights, setAiInsights] = useState('')
  const [generatingInsights, setGeneratingInsights] = useState(false)
  const [dismissedExceptions, setDismissedExceptions] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try { return new Set(JSON.parse(sessionStorage.getItem('dismissedExceptions') ?? '[]')) } catch { return new Set() }
    }
    return new Set()
  })

  async function handleAnalyzePortfolio() {
    setGeneratingInsights(true)
    setAiInsights('')
    const res = await fetch('/api/ai/anomalies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: '' }),
    })
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      setAiInsights(t => t + dec.decode(value, { stream: true }))
    }
    setGeneratingInsights(false)
  }

  function dismissException(type: string) {
    const next = new Set(dismissedExceptions)
    next.add(type)
    setDismissedExceptions(next)
    sessionStorage.setItem('dismissedExceptions', JSON.stringify(Array.from(next)))
  }

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(setData).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>

  const { stats, recentLedger, urgentWorkOrders, properties, exceptions } = data ?? {}

  const alerts: { label: string; severity: 'warning' | 'danger' }[] = []
  if (stats?.expiringLeases30 > 0) alerts.push({ label: `${stats.expiringLeases30} lease${stats.expiringLeases30 > 1 ? 's' : ''} expiring in 30 days`, severity: 'danger' })
  if (stats?.expiringLeases60 > 0 && stats.expiringLeases60 > stats.expiringLeases30) alerts.push({ label: `${stats.expiringLeases60} leases expiring in 60 days`, severity: 'warning' })
  const lowOccupancy = properties?.filter((p: any) => p.totalUnits > 0 && p.occupancyRate < 80) ?? []
  if (lowOccupancy.length > 0) alerts.push({ label: `${lowOccupancy.length} propert${lowOccupancy.length > 1 ? 'ies' : 'y'} below 80% occupancy`, severity: 'warning' })

  const visibleExceptions = (exceptions ?? []).filter((ex: any) => !dismissedExceptions.has(ex.type))

  const chartData = (properties ?? []).slice(0, 12).map((p: any) => ({
    name: p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name,
    occupancy: p.occupancyRate,
  }))

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Portfolio overview" />

      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {alerts.map((alert, i) => (
            <div key={i} className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${alert.severity === 'danger' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-yellow-50 text-yellow-800 border border-yellow-200'}`}>
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {alert.label}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatsCard title="Total Units" value={stats?.totalUnits ?? 0} subtitle={`${stats?.vacantUnits ?? 0} available`} icon={DoorOpen} iconColor="text-blue-600" iconBg="bg-blue-50" />
        <StatsCard title="Occupancy Rate" value={`${stats?.occupancyRate ?? 0}%`} subtitle={`${stats?.occupiedUnits ?? 0} occupied`} icon={TrendingUp} iconColor="text-green-600" iconBg="bg-green-50" />
        <StatsCard title="Open Work Orders" value={stats?.openWorkOrders ?? 0} subtitle="New + in progress" icon={Wrench} iconColor="text-orange-600" iconBg="bg-orange-50" />
        <StatsCard title="Expiring Leases" value={stats?.expiringLeases30 ?? 0} subtitle="Within 30 days" icon={Clock} iconColor="text-red-600" iconBg="bg-red-50" />
      </div>

      {/* Exception alerts widget */}
      {visibleExceptions.length > 0 && (
        <Card className="mb-6 border-orange-200 bg-orange-50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-orange-900 text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Alerts
            </h3>
          </div>
          <div className="space-y-2">
            {visibleExceptions.map((ex: any) => (
              <div key={ex.type} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${ex.severity === 'danger' ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-yellow-50 border border-yellow-200 text-yellow-800'}`}>
                <Link href={ex.href} className="flex items-center gap-1.5 hover:underline flex-1">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  {ex.label}
                  <ExternalLink className="h-3 w-3 ml-1 opacity-60" />
                </Link>
                <button onClick={() => dismissException(ex.type)} className="ml-3 opacity-50 hover:opacity-100 flex-shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* AI Insights */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-indigo-500" /> AI Insights
          </h3>
          <button
            onClick={handleAnalyzePortfolio}
            disabled={generatingInsights}
            className="text-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg px-3 py-1.5 font-medium transition-colors disabled:opacity-50"
          >
            {generatingInsights ? 'Analyzing…' : 'Analyze Portfolio'}
          </button>
        </div>
        {!aiInsights && !generatingInsights && (
          <p className="text-sm text-gray-400">Click to surface non-obvious patterns and actionable insights across your portfolio.</p>
        )}
        {generatingInsights && !aiInsights && (
          <p className="text-sm text-gray-400"><span className="animate-pulse">…</span></p>
        )}
        {aiInsights && (
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {aiInsights}
            {generatingInsights && <span className="animate-pulse">…</span>}
          </p>
        )}
      </Card>

      {/* Occupancy chart */}
      {chartData.length > 0 && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Occupancy by Property</CardTitle></CardHeader>
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: any) => [`${v}%`, 'Occupancy']} />
                <Bar dataKey="occupancy" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry: any, index: number) => (
                    <Cell key={index} fill={entry.occupancy >= 80 ? '#22c55e' : entry.occupancy >= 60 ? '#eab308' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {properties && properties.length > 0 && (
        <Card padding="none" className="mb-6">
          <div className="p-6 pb-0"><CardHeader><CardTitle>Properties</CardTitle></CardHeader></div>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Property</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Units</TableHeader>
                <TableHeader>Occupancy</TableHeader>
                <TableHeader>Open WOs</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {properties.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell><Link href={`/dashboard/properties/${p.id}`} className="font-medium text-blue-600 hover:underline">{p.name}</Link></TableCell>
                  <TableCell><PropertyStatusBadge status={p.status} /></TableCell>
                  <TableCell>{p.totalUnits}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-200 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${p.occupancyRate >= 80 ? 'bg-green-500' : p.occupancyRate >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${p.occupancyRate}%` }} />
                      </div>
                      <span className="text-sm text-gray-600">{p.occupancyRate}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-600">{p.openWorkOrders}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card padding="none">
          <div className="p-6 pb-0"><CardHeader><CardTitle>Recent Transactions</CardTitle></CardHeader></div>
          <Table>
            <TableHead><TableRow><TableHeader>Property</TableHeader><TableHeader>Type</TableHeader><TableHeader>Amount</TableHeader><TableHeader>Date</TableHeader></TableRow></TableHead>
            <TableBody>
              {(recentLedger?.length === 0) && <TableEmptyState message="No transactions yet" />}
              {recentLedger?.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium text-sm">{e.property?.name ?? e.lease?.unit?.property?.name}</TableCell>
                  <TableCell className="text-gray-500 text-xs">{e.type.replace(/_/g, ' ')}</TableCell>
                  <TableCell className={e.amount >= 0 ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>{e.amount >= 0 ? '+' : ''}{formatCurrency(e.amount)}</TableCell>
                  <TableCell className="text-gray-500">{formatDate(e.effectiveDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <Card padding="none">
          <div className="p-6 pb-0"><CardHeader><CardTitle>Urgent Work Orders</CardTitle></CardHeader></div>
          <Table>
            <TableHead><TableRow><TableHeader>Issue</TableHeader><TableHeader>Property</TableHeader><TableHeader>Priority</TableHeader><TableHeader>Status</TableHeader></TableRow></TableHead>
            <TableBody>
              {(urgentWorkOrders?.length === 0) && <TableEmptyState message="No urgent issues" />}
              {urgentWorkOrders?.map((w: any) => (
                <TableRow key={w.id}>
                  <TableCell><Link href={`/dashboard/workorders/${w.id}`} className="font-medium text-blue-600 hover:underline max-w-[140px] block truncate">{w.title}</Link></TableCell>
                  <TableCell className="text-gray-500 text-sm">{w.property?.name}</TableCell>
                  <TableCell><WorkOrderPriorityBadge priority={w.priority} /></TableCell>
                  <TableCell><WorkOrderStatusBadge status={w.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  )
}

// ── Tenant dashboard ───────────────────────────────────────────────────────

function TenantDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showWOModal, setShowWOModal] = useState(false)
  const [woForm, setWoForm] = useState({ title: '', description: '', category: 'GENERAL', priority: 'MEDIUM' })
  const [woSaving, setWOSaving] = useState(false)
  const [woFiles, setWoFiles] = useState<File[]>([])
  const woFileRef = useRef<HTMLInputElement>(null)
  const woCameraRef = useRef<HTMLInputElement>(null)

  // AI triage
  const [triageSuggestion, setTriageSuggestion] = useState<{ category: string; priority: string; urgencyNotes: string } | null>(null)
  const [triaging, setTriaging] = useState(false)

  async function handleAITriage() {
    if (woForm.description.length < 20) return
    setTriaging(true)
    setTriageSuggestion(null)
    const res = await fetch('/api/ai/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: woForm.title || 'Maintenance request', description: woForm.description }),
    })
    const data = await res.json()
    if (!data.error) {
      setTriageSuggestion(data)
      setWoForm(f => ({ ...f, category: data.category ?? f.category, priority: data.priority ?? f.priority }))
    }
    setTriaging(false)
  }

  async function load() {
    fetch('/api/portal').then(r => r.json()).then(setData).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleSubmitWO(e: React.FormEvent) {
    e.preventDefault()
    setWOSaving(true)
    const propertyId = data?.activeLease?.unit?.property?.id
    const unitId = data?.activeLease?.unitId
    const res = await fetch('/api/workorders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...woForm, propertyId, unitId }),
    })
    const wo = await res.json()
    // Upload photos/attachments if provided
    if (woFiles.length > 0 && wo?.id) {
      for (const file of woFiles) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('scopeType', 'workorder')
        fd.append('scopeId', wo.id)
        fd.append('workOrderId', wo.id)
        if (propertyId) fd.append('propertyId', propertyId)
        await fetch('/api/documents', { method: 'POST', body: fd })
      }
    }
    setWOSaving(false)
    setShowWOModal(false)
    setWoForm({ title: '', description: '', category: 'GENERAL', priority: 'MEDIUM' })
    setWoFiles([])
    if (woFileRef.current) woFileRef.current.value = ''
    if (woCameraRef.current) woCameraRef.current.value = ''
    load()
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>

  const { activeLease, balance, workOrders } = data ?? {}
  const property = activeLease?.unit?.property
  const unit = activeLease?.unit
  const daysLeft = activeLease ? Math.round((new Date(activeLease.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null

  const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div>
      <PageHeader title="My Home" subtitle={property ? `${property.name} — Unit ${unit?.unitNumber}` : 'Welcome'} />

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={() => setShowWOModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus className="h-4 w-4" /> Submit Work Order
        </button>
        <Link href="/dashboard/my-payments" className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
          <CreditCard className="h-4 w-4" /> Make Payment
        </Link>
        <Link href="/dashboard/my-lease" className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
          <FileText className="h-4 w-4" /> View Lease
        </Link>
        <Link href="/dashboard/incidents" className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">
          <AlertTriangle className="h-4 w-4" /> Report Issue
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <p className="text-sm text-gray-500 mb-1">Current Rent</p>
          <p className="text-2xl font-bold">{activeLease ? formatCurrency(activeLease.monthlyRent) : '—'}</p>
          <p className="text-xs text-gray-400">per month</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 mb-1">Account Balance</p>
          <p className={`text-2xl font-bold ${balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {formatCurrency(Math.abs(balance ?? 0))}
          </p>
          <p className="text-xs text-gray-400">{(balance ?? 0) >= 0 ? 'credit' : 'owed'}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 mb-1">Lease Ends</p>
          <p className={`text-2xl font-bold ${daysLeft !== null && daysLeft <= 30 ? 'text-red-700' : daysLeft !== null && daysLeft <= 90 ? 'text-yellow-700' : ''}`}>
            {daysLeft !== null ? `${daysLeft}d` : '—'}
          </p>
          {activeLease && <p className="text-xs text-gray-400">{formatDate(activeLease.endDate)}</p>}
        </Card>
      </div>

      {/* Lease info */}
      {activeLease ? (
        <Card className="mb-6">
          <CardHeader><CardTitle>Current Lease</CardTitle></CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            <div><p className="text-xs text-gray-500">Property</p><p className="font-medium text-sm">{property?.name}</p></div>
            <div><p className="text-xs text-gray-500">Unit</p><p className="font-medium text-sm">{unit?.unitNumber} · {unit?.bedrooms}BR/{unit?.bathrooms}BA</p></div>
            <div><p className="text-xs text-gray-500">Lease Start</p><p className="font-medium text-sm">{formatDate(activeLease.startDate)}</p></div>
            <div><p className="text-xs text-gray-500">Lease End</p><p className={`font-medium text-sm ${daysLeft !== null && daysLeft <= 30 ? 'text-red-600' : ''}`}>{formatDate(activeLease.endDate)}</p></div>
          </div>
          {daysLeft !== null && daysLeft <= 60 && (
            <div className={`mt-4 flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${daysLeft <= 30 ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Your lease expires in {daysLeft} days. Contact your property manager about renewal.
            </div>
          )}
        </Card>
      ) : (
        <Card className="mb-6 text-center py-8">
          <Home className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">No active lease on file.</p>
        </Card>
      )}

      {/* My work orders */}
      <Card padding="none">
        <div className="p-6 pb-0 flex items-center justify-between">
          <CardHeader><CardTitle>My Work Orders</CardTitle></CardHeader>
          <button onClick={() => setShowWOModal(true)} className="text-sm text-blue-600 hover:underline">+ Submit new</button>
        </div>
        <Table>
          <TableHead><TableRow><TableHeader>Title</TableHeader><TableHeader>Property</TableHeader><TableHeader>Priority</TableHeader><TableHeader>Status</TableHeader></TableRow></TableHead>
          <TableBody>
            {(workOrders?.length === 0) && <TableEmptyState message="No work orders submitted" />}
            {workOrders?.map((w: any) => (
              <TableRow key={w.id}>
                <TableCell><Link href={`/dashboard/workorders/${w.id}`} className="font-medium text-blue-600 hover:underline">{w.title}</Link></TableCell>
                <TableCell className="text-gray-500 text-sm">{w.property?.name}</TableCell>
                <TableCell><WorkOrderPriorityBadge priority={w.priority} /></TableCell>
                <TableCell><WorkOrderStatusBadge status={w.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Submit WO Modal */}
      {showWOModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Submit Work Order</h3>
              <button onClick={() => setShowWOModal(false)} className="text-gray-400 hover:text-gray-600"><Plus className="h-5 w-5 rotate-45" /></button>
            </div>
            <form onSubmit={handleSubmitWO} className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Issue Title *</label><input className={INPUT_CLS} value={woForm.title} onChange={e => setWoForm({ ...woForm, title: e.target.value })} placeholder="e.g. Leaking faucet in bathroom" required /></div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <textarea className={INPUT_CLS} rows={3} value={woForm.description} onChange={e => setWoForm({ ...woForm, description: e.target.value })} placeholder="Describe the issue in detail" required />
                {woForm.description.length >= 20 && (
                  <button type="button" onClick={handleAITriage} disabled={triaging} className="mt-1.5 flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50">
                    <Wand2 className="h-3.5 w-3.5" />
                    {triaging ? 'Analyzing…' : 'AI Suggest category & priority'}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Category</label><select className={INPUT_CLS} value={woForm.category} onChange={e => setWoForm({ ...woForm, category: e.target.value })}>{['PLUMBING', 'HVAC', 'ELECTRICAL', 'GENERAL', 'TURNOVER', 'OTHER'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Priority</label><select className={INPUT_CLS} value={woForm.priority} onChange={e => setWoForm({ ...woForm, priority: e.target.value })}>{['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'].map(p => <option key={p} value={p}>{p}</option>)}</select></div>
              </div>
              {triageSuggestion && (
                <div className="flex items-start gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
                  <Wand2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-yellow-600" />
                  <span><span className="font-medium">AI note:</span> {triageSuggestion.urgencyNotes}</span>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Paperclip className="inline h-4 w-4 mr-1 text-gray-400" />
                  Photos / Attachments (optional)
                </label>
                <div className="flex gap-2">
                  <label className="flex-1 cursor-pointer">
                    <input
                      ref={woFileRef}
                      type="file"
                      accept="image/*,.pdf,.doc,.docx"
                      multiple
                      className="w-full text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      onChange={e => { if (e.target.files) setWoFiles(prev => [...prev, ...Array.from(e.target.files!)]) }}
                    />
                  </label>
                  <label className="cursor-pointer flex items-center gap-1 px-3 py-1 rounded-md bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100">
                    <Camera className="h-4 w-4" />
                    <span className="hidden sm:inline">Camera</span>
                    <input
                      ref={woCameraRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="hidden"
                      onChange={e => { if (e.target.files) setWoFiles(prev => [...prev, ...Array.from(e.target.files!)]) }}
                    />
                  </label>
                </div>
                {woFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {woFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">
                        <span className="truncate">{f.name}</span>
                        <button type="button" onClick={() => setWoFiles(prev => prev.filter((_, j) => j !== i))} className="ml-2 text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowWOModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={woSaving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">{woSaving ? 'Submitting…' : 'Submit'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Root ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated') {
      if (session?.user?.systemRole === 'VENDOR') router.replace('/dashboard/vendor-portal')
      if (session?.user?.systemRole === 'OWNER') router.replace('/dashboard/owner-portal')
    }
  }, [status, session, router])

  if (status === 'loading') return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )

  const role = session?.user?.systemRole
  if (role === 'VENDOR' || role === 'OWNER') return null   // redirecting via useEffect
  return role === 'TENANT' ? <TenantDashboard /> : <ManagerDashboard />
}
