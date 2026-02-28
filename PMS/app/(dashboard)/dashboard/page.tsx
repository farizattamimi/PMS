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
import { ManagerDashboardSkeleton, TenantDashboardSkeleton } from '@/components/ui/Skeleton'

// ── Manager / Admin dashboard ───────────────────────────────────────────────

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

  if (loading) return <ManagerDashboardSkeleton />

  const { stats, recentLedger, urgentWorkOrders, properties, exceptions } = data ?? {}

  const alerts: { label: string; severity: 'warning' | 'danger' }[] = []
  if (stats?.expiringLeases30 > 0)
    alerts.push({ label: `${stats.expiringLeases30} lease${stats.expiringLeases30 > 1 ? 's' : ''} expiring within 30 days`, severity: 'danger' })
  if (stats?.expiringLeases60 > 0 && stats.expiringLeases60 > stats.expiringLeases30)
    alerts.push({ label: `${stats.expiringLeases60} leases expiring within 60 days`, severity: 'warning' })
  const lowOccupancy = properties?.filter((p: any) => p.totalUnits > 0 && p.occupancyRate < 80) ?? []
  if (lowOccupancy.length > 0)
    alerts.push({ label: `${lowOccupancy.length} propert${lowOccupancy.length > 1 ? 'ies' : 'y'} below 80% occupancy`, severity: 'warning' })

  const visibleExceptions = (exceptions ?? []).filter((ex: any) => !dismissedExceptions.has(ex.type))

  const chartData = (properties ?? []).slice(0, 12).map((p: any) => ({
    name: p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name,
    occupancy: p.occupancyRate,
  }))

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Dashboard" subtitle="Portfolio overview" />

      {/* Alert banners */}
      {alerts.length > 0 && (
        <div className="mb-5 space-y-2">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-[12px] font-medium"
              style={
                alert.severity === 'danger'
                  ? { background: 'var(--accent-red-muted)', color: 'var(--accent-red)', border: '1px solid rgba(255,77,106,0.2)' }
                  : { background: 'var(--accent-yellow-muted)', color: 'var(--accent-yellow)', border: '1px solid rgba(255,181,52,0.2)' }
              }
            >
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              {alert.label}
            </div>
          ))}
        </div>
      )}

      {/* KPI stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        <StatsCard
          title="Total Units"
          value={stats?.totalUnits ?? 0}
          subtitle={`${stats?.vacantUnits ?? 0} available`}
          icon={DoorOpen}
          iconColor="text-blue-400"
          iconBg="bg-blue-500/10"
          accentColor="var(--accent-blue)"
        />
        <StatsCard
          title="Occupancy Rate"
          value={`${stats?.occupancyRate ?? 0}%`}
          subtitle={`${stats?.occupiedUnits ?? 0} occupied`}
          icon={TrendingUp}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-500/10"
          accentColor="var(--accent-green)"
        />
        <StatsCard
          title="Open Work Orders"
          value={stats?.openWorkOrders ?? 0}
          subtitle="New + in progress"
          icon={Wrench}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/10"
          accentColor="var(--accent-amber)"
        />
        <StatsCard
          title="Expiring Leases"
          value={stats?.expiringLeases30 ?? 0}
          subtitle="Within 30 days"
          icon={Clock}
          iconColor="text-rose-400"
          iconBg="bg-rose-500/10"
          accentColor="var(--accent-red)"
        />
      </div>

      {/* Exception alerts */}
      {visibleExceptions.length > 0 && (
        <div
          className="mb-5 rounded-xl p-4"
          style={{ background: 'var(--accent-yellow-muted)', border: '1px solid rgba(255,181,52,0.18)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-3.5 w-3.5" style={{ color: 'var(--accent-yellow)' }} />
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--accent-yellow)' }}>
              Active Alerts
            </span>
          </div>
          <div className="space-y-2">
            {visibleExceptions.map((ex: any) => (
              <div
                key={ex.type}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-[12px]"
                style={
                  ex.severity === 'danger'
                    ? { background: 'var(--accent-red-muted)', color: 'var(--accent-red)', border: '1px solid rgba(255,77,106,0.15)' }
                    : { background: 'var(--accent-yellow-muted)', color: 'var(--accent-yellow)', border: '1px solid rgba(255,181,52,0.15)' }
                }
              >
                <Link href={ex.href} className="flex items-center gap-1.5 hover:opacity-80 flex-1 transition-opacity">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  {ex.label}
                  <ExternalLink className="h-3 w-3 ml-1 opacity-50" />
                </Link>
                <button onClick={() => dismissException(ex.type)} className="ml-3 opacity-50 hover:opacity-100 flex-shrink-0 transition-opacity">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Insights */}
      <Card className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" style={{ color: 'var(--accent-amber)' }} />
            <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              AI Insights
            </span>
          </div>
          <button
            onClick={handleAnalyzePortfolio}
            disabled={generatingInsights}
            className="text-[11px] px-3 py-1.5 rounded-lg font-semibold transition-all disabled:opacity-40"
            style={{
              background: 'var(--accent-amber-muted)',
              color: 'var(--accent-amber)',
              border: '1px solid rgba(245,158,11,0.2)',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--accent-amber-glow)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--accent-amber-muted)'}
          >
            {generatingInsights ? 'Analyzing…' : 'Analyze Portfolio'}
          </button>
        </div>
        {!aiInsights && !generatingInsights && (
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Click to surface non-obvious patterns and actionable insights across your portfolio.
          </p>
        )}
        {generatingInsights && !aiInsights && (
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            <span className="animate-pulse">Analyzing portfolio data…</span>
          </p>
        )}
        {aiInsights && (
          <p className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
            {aiInsights}
            {generatingInsights && <span className="animate-pulse">…</span>}
          </p>
        )}
      </Card>

      {/* Occupancy chart */}
      {chartData.length > 0 && (
        <Card className="mb-5">
          <CardHeader className="mb-4">
            <CardTitle>Occupancy by Property</CardTitle>
          </CardHeader>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `${v}%`}
                />
                <Tooltip
                  formatter={(v: any) => [`${v}%`, 'Occupancy']}
                  contentStyle={{
                    background: 'var(--surface-raised)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '11px',
                  }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Bar dataKey="occupancy" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry: any, index: number) => (
                    <Cell
                      key={index}
                      fill={
                        entry.occupancy >= 80 ? '#10E3A5'
                        : entry.occupancy >= 60 ? '#FFB534'
                        : '#FF4D6A'
                      }
                      opacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Properties table */}
      {properties && properties.length > 0 && (
        <Card padding="none" className="mb-5">
          <div className="px-5 pt-5 pb-3">
            <CardHeader>
              <CardTitle>Properties</CardTitle>
            </CardHeader>
          </div>
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
                  <TableCell>
                    <Link
                      href={`/dashboard/properties/${p.id}`}
                      className="font-medium hover:opacity-70 transition-opacity"
                      style={{ color: 'var(--accent-amber)' }}
                    >
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell><PropertyStatusBadge status={p.status} /></TableCell>
                  <TableCell className="font-data">{p.totalUnits}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-16 rounded-full h-1"
                        style={{ background: 'var(--surface-hover)' }}
                      >
                        <div
                          className="h-1 rounded-full transition-all"
                          style={{
                            width: `${p.occupancyRate}%`,
                            background: p.occupancyRate >= 80 ? 'var(--accent-green)'
                              : p.occupancyRate >= 60 ? 'var(--accent-yellow)'
                              : 'var(--accent-red)',
                          }}
                        />
                      </div>
                      <span className="text-[11px] font-data" style={{ color: 'var(--text-secondary)' }}>
                        {p.occupancyRate}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-data" style={{ color: 'var(--text-muted)' }}>
                    {p.openWorkOrders}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Bottom two-col tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card padding="none">
          <div className="px-5 pt-5 pb-3">
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
            </CardHeader>
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Property</TableHeader>
                <TableHeader>Type</TableHeader>
                <TableHeader>Amount</TableHeader>
                <TableHeader>Date</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {(recentLedger?.length === 0) && <TableEmptyState message="No transactions yet" />}
              {recentLedger?.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium text-[12px]">
                    {e.property?.name ?? e.lease?.unit?.property?.name}
                  </TableCell>
                  <TableCell
                    className="text-[11px] uppercase tracking-wide"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {e.type.replace(/_/g, ' ')}
                  </TableCell>
                  <TableCell
                    className="font-data font-medium text-[12px]"
                    style={{ color: e.amount >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
                  >
                    {e.amount >= 0 ? '+' : ''}{formatCurrency(e.amount)}
                  </TableCell>
                  <TableCell className="font-data text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(e.effectiveDate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card padding="none">
          <div className="px-5 pt-5 pb-3">
            <CardHeader>
              <CardTitle>Urgent Work Orders</CardTitle>
            </CardHeader>
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Issue</TableHeader>
                <TableHeader>Property</TableHeader>
                <TableHeader>Priority</TableHeader>
                <TableHeader>Status</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {(urgentWorkOrders?.length === 0) && <TableEmptyState message="No urgent issues" />}
              {urgentWorkOrders?.map((w: any) => (
                <TableRow key={w.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/workorders/${w.id}`}
                      className="font-medium hover:opacity-70 transition-opacity max-w-[140px] block truncate"
                      style={{ color: 'var(--accent-amber)' }}
                    >
                      {w.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {w.property?.name}
                  </TableCell>
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

// ── Tenant dashboard ────────────────────────────────────────────────────────

function TenantDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showWOModal, setShowWOModal] = useState(false)
  const [woForm, setWoForm] = useState({ title: '', description: '', category: 'GENERAL', priority: 'MEDIUM' })
  const [woSaving, setWOSaving] = useState(false)
  const [woFiles, setWoFiles] = useState<File[]>([])
  const woFileRef = useRef<HTMLInputElement>(null)
  const woCameraRef = useRef<HTMLInputElement>(null)

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

  if (loading) return <TenantDashboardSkeleton />

  const { activeLease, balance, workOrders } = data ?? {}
  const property = activeLease?.unit?.property
  const unit = activeLease?.unit
  const daysLeft = activeLease
    ? Math.round((new Date(activeLease.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const INPUT_CLS = 'w-full rounded-lg px-3 py-2 text-[12px] focus:outline-none transition-colors'
  const inputStyle = {
    background: 'var(--surface-hover)',
    border: '1px solid var(--border-strong)',
    color: 'var(--text-primary)',
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="My Home"
        subtitle={property ? `${property.name} — Unit ${unit?.unitNumber}` : 'Welcome'}
      />

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2.5 mb-6">
        <button
          onClick={() => setShowWOModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all"
          style={{ background: 'var(--accent-amber)', color: '#08090F' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.85'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
        >
          <Plus className="h-3.5 w-3.5" /> Submit Work Order
        </button>
        <Link
          href="/dashboard/my-payments"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all"
          style={{
            background: 'var(--accent-green-muted)',
            color: 'var(--accent-green)',
            border: '1px solid rgba(16,227,165,0.2)',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.8'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
        >
          <CreditCard className="h-3.5 w-3.5" /> Make Payment
        </Link>
        <Link
          href="/dashboard/my-lease"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium transition-all"
          style={{ background: 'var(--surface-raised)', color: 'var(--text-secondary)', border: '1px solid var(--border-strong)' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}
        >
          <FileText className="h-3.5 w-3.5" /> View Lease
        </Link>
        <Link
          href="/dashboard/incidents"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium transition-all"
          style={{ background: 'var(--accent-red-muted)', color: 'var(--accent-red)', border: '1px solid rgba(255,77,106,0.2)' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.8'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
        >
          <AlertTriangle className="h-3.5 w-3.5" /> Report Issue
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <Card>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Current Rent</p>
          <p className="font-data text-3xl font-medium leading-none" style={{ color: 'var(--text-primary)' }}>
            {activeLease ? formatCurrency(activeLease.monthlyRent) : '—'}
          </p>
          <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>per month</p>
        </Card>
        <Card>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Account Balance</p>
          <p
            className="font-data text-3xl font-medium leading-none"
            style={{ color: (balance ?? 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
          >
            {formatCurrency(Math.abs(balance ?? 0))}
          </p>
          <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
            {(balance ?? 0) >= 0 ? 'credit' : 'owed'}
          </p>
        </Card>
        <Card>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Lease Ends</p>
          <p
            className="font-data text-3xl font-medium leading-none"
            style={{
              color: daysLeft !== null && daysLeft <= 30 ? 'var(--accent-red)'
                : daysLeft !== null && daysLeft <= 90 ? 'var(--accent-yellow)'
                : 'var(--text-primary)',
            }}
          >
            {daysLeft !== null ? `${daysLeft}d` : '—'}
          </p>
          {activeLease && (
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
              {formatDate(activeLease.endDate)}
            </p>
          )}
        </Card>
      </div>

      {/* Lease info */}
      {activeLease ? (
        <Card className="mb-5">
          <CardHeader className="mb-4">
            <CardTitle>Current Lease</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Property</p>
              <p className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>{property?.name}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Unit</p>
              <p className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>
                {unit?.unitNumber} · {unit?.bedrooms}BR/{unit?.bathrooms}BA
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Lease Start</p>
              <p className="text-[12px] font-data" style={{ color: 'var(--text-primary)' }}>{formatDate(activeLease.startDate)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Lease End</p>
              <p
                className="text-[12px] font-data"
                style={{ color: daysLeft !== null && daysLeft <= 30 ? 'var(--accent-red)' : 'var(--text-primary)' }}
              >
                {formatDate(activeLease.endDate)}
              </p>
            </div>
          </div>
          {daysLeft !== null && daysLeft <= 60 && (
            <div
              className="mt-4 flex items-center gap-2 text-[12px] px-3 py-2.5 rounded-lg"
              style={
                daysLeft <= 30
                  ? { background: 'var(--accent-red-muted)', color: 'var(--accent-red)', border: '1px solid rgba(255,77,106,0.15)' }
                  : { background: 'var(--accent-yellow-muted)', color: 'var(--accent-yellow)', border: '1px solid rgba(255,181,52,0.15)' }
              }
            >
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              Your lease expires in {daysLeft} days. Contact your property manager about renewal.
            </div>
          )}
        </Card>
      ) : (
        <Card className="mb-5 text-center py-10">
          <Home className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>No active lease on file.</p>
        </Card>
      )}

      {/* My work orders */}
      <Card padding="none">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <CardTitle>My Work Orders</CardTitle>
          <button
            onClick={() => setShowWOModal(true)}
            className="text-[11px] font-medium transition-colors"
            style={{ color: 'var(--accent-amber)' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.7'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
          >
            + Submit new
          </button>
        </div>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Title</TableHeader>
              <TableHeader>Property</TableHeader>
              <TableHeader>Priority</TableHeader>
              <TableHeader>Status</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {(workOrders?.length === 0) && <TableEmptyState message="No work orders submitted" />}
            {workOrders?.map((w: any) => (
              <TableRow key={w.id}>
                <TableCell>
                  <Link
                    href={`/dashboard/workorders/${w.id}`}
                    className="font-medium hover:opacity-70 transition-opacity"
                    style={{ color: 'var(--accent-amber)' }}
                  >
                    {w.title}
                  </Link>
                </TableCell>
                <TableCell className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {w.property?.name}
                </TableCell>
                <TableCell><WorkOrderPriorityBadge priority={w.priority} /></TableCell>
                <TableCell><WorkOrderStatusBadge status={w.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Submit WO Modal */}
      {showWOModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up"
            style={{
              background: 'var(--surface-raised)',
              border: '1px solid var(--border-strong)',
              boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                Submit Work Order
              </h3>
              <button
                onClick={() => setShowWOModal(false)}
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitWO} className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-medium mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  Issue Title *
                </label>
                <input
                  className={INPUT_CLS}
                  style={inputStyle}
                  value={woForm.title}
                  onChange={e => setWoForm({ ...woForm, title: e.target.value })}
                  placeholder="e.g. Leaking faucet in bathroom"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  Description *
                </label>
                <textarea
                  className={INPUT_CLS}
                  style={inputStyle}
                  rows={3}
                  value={woForm.description}
                  onChange={e => setWoForm({ ...woForm, description: e.target.value })}
                  placeholder="Describe the issue in detail"
                  required
                />
                {woForm.description.length >= 20 && (
                  <button
                    type="button"
                    onClick={handleAITriage}
                    disabled={triaging}
                    className="mt-2 flex items-center gap-1.5 text-[11px] font-medium disabled:opacity-50 transition-opacity"
                    style={{ color: 'var(--accent-amber)' }}
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    {triaging ? 'Analyzing…' : 'AI Suggest category & priority'}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    Category
                  </label>
                  <select
                    className={INPUT_CLS}
                    style={inputStyle}
                    value={woForm.category}
                    onChange={e => setWoForm({ ...woForm, category: e.target.value })}
                  >
                    {['PLUMBING', 'HVAC', 'ELECTRICAL', 'GENERAL', 'TURNOVER', 'OTHER'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    Priority
                  </label>
                  <select
                    className={INPUT_CLS}
                    style={inputStyle}
                    value={woForm.priority}
                    onChange={e => setWoForm({ ...woForm, priority: e.target.value })}
                  >
                    {['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              {triageSuggestion && (
                <div
                  className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[11px]"
                  style={{ background: 'var(--accent-amber-muted)', color: 'var(--accent-yellow)', border: '1px solid rgba(245,158,11,0.15)' }}
                >
                  <Wand2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-amber)' }} />
                  <span>
                    <span className="font-semibold" style={{ color: 'var(--accent-amber)' }}>AI note: </span>
                    {triageSuggestion.urgencyNotes}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-medium mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  <Paperclip className="inline h-3.5 w-3.5 mr-1 opacity-60" />
                  Photos / Attachments (optional)
                </label>
                <div className="flex gap-2">
                  <label className="flex-1 cursor-pointer">
                    <input
                      ref={woFileRef}
                      type="file"
                      accept="image/*,.pdf,.doc,.docx"
                      multiple
                      className="w-full text-[11px] file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-[11px] file:font-semibold"
                      style={{ color: 'var(--text-muted)' }}
                      onChange={e => { if (e.target.files) setWoFiles(prev => [...prev, ...Array.from(e.target.files!)]) }}
                    />
                  </label>
                  <label
                    className="cursor-pointer flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold"
                    style={{ background: 'var(--surface-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-strong)' }}
                  >
                    <Camera className="h-3.5 w-3.5" />
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
                      <div
                        key={i}
                        className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg"
                        style={{ background: 'var(--surface-hover)', color: 'var(--text-secondary)' }}
                      >
                        <span className="truncate">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setWoFiles(prev => prev.filter((_, j) => j !== i))}
                          className="ml-2 transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--accent-red)'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowWOModal(false)}
                  className="px-4 py-2 text-[12px] font-medium rounded-lg transition-colors"
                  style={{ color: 'var(--text-muted)', background: 'transparent' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={woSaving}
                  className="px-4 py-2 text-[12px] font-bold rounded-lg transition-all disabled:opacity-50"
                  style={{ background: 'var(--accent-amber)', color: '#08090F' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.85'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                >
                  {woSaving ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Root ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated') {
      if (session?.user?.systemRole === 'VENDOR') router.replace('/dashboard/vendor-portal')
      if (session?.user?.systemRole === 'OWNER') router.replace('/dashboard/owner-portal')
    }
  }, [status, session, router])

  if (status === 'loading') return <ManagerDashboardSkeleton />

  const role = session?.user?.systemRole
  if (role === 'VENDOR' || role === 'OWNER') return null
  return role === 'TENANT' ? <TenantDashboard /> : <ManagerDashboard />
}
