'use client'

import { useEffect, useState, useRef } from 'react'
import { Download, Printer, FileText, Wand2 } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  LineChart, Line,
} from 'recharts'

export default function ReportingPage() {
  const [properties, setProperties] = useState<any[]>([])
  const [propertyId, setPropertyId] = useState('') // empty = portfolio
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const [leasingVelocity, setLeasingVelocity] = useState<any>(null)
  const [renewalData, setRenewalData] = useState<any>(null)

  // AI Portfolio Summary
  const [aiSummary, setAiSummary] = useState('')
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [summaryGeneratedAt, setSummaryGeneratedAt] = useState<Date | null>(null)

  async function generateAISummary() {
    setGeneratingSummary(true)
    setAiSummary('')
    const res = await fetch('/api/ai/portfolio-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: propertyId || undefined }),
    })
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      setAiSummary(t => t + dec.decode(value, { stream: true }))
    }
    setGeneratingSummary(false)
    setSummaryGeneratedAt(new Date())
  }

  useEffect(() => { fetch('/api/properties').then(r => r.json()).then(setProperties) }, [])

  useEffect(() => {
    const params = new URLSearchParams({ months: '12' })
    if (propertyId) params.set('propertyId', propertyId)
    fetch(`/api/reports/leasing-velocity?${params}`).then(r => r.json()).then(setLeasingVelocity)
    fetch(`/api/reports/renewals?${propertyId ? `propertyId=${propertyId}` : ''}`).then(r => r.json()).then(setRenewalData)
  }, [propertyId])

  async function runReport() {
    if (!month) return
    setLoading(true)
    const params = new URLSearchParams({ month })
    if (propertyId) params.set('propertyId', propertyId)
    const res = await fetch(`/api/reports/summary?${params}`)
    setReport(await res.json())
    setLoading(false)
  }

  function downloadCSV() {
    if (!report) return
    const rows: (string | number)[][] = [
      ['Monthly Operations Summary', '', '', ''],
      ['Period', report.month, '', ''],
      ['Scope', report.isPortfolio ? 'Portfolio' : report.property?.name, '', ''],
      [''],
      ['KPIs', 'Value'],
      ['Total Units', report.occupancy?.total],
      ['Occupied Units', report.occupancy?.occupied],
      ['Occupancy Rate', `${report.occupancy?.rate}%`],
      ['Active Leases', report.leases?.active],
      ['Total Income', report.financials?.income],
      ['Total Expenses', report.financials?.expenses],
      ['NOI', report.financials?.noi],
      ['Total Work Orders', report.workOrders?.total],
      [''],
    ]

    if (report.isPortfolio) {
      rows.push(['Property Breakdown', 'Units', 'Occ%', 'Open WOs', 'NOI'])
      for (const p of report.properties ?? []) {
        rows.push([p.name, p.units, `${p.occupancyRate}%`, p.openWorkOrders, p.noi])
      }
      rows.push([''])
    }

    rows.push(['Lease Expirations', 'Count'])
    rows.push(['Next 30 days', report.leases?.expiring30])
    rows.push(['31–60 days', report.leases?.expiring60])
    rows.push(['61–90 days', report.leases?.expiring90])
    rows.push([''])

    rows.push(['Work Orders by Status', 'Count'])
    for (const [status, count] of Object.entries(report.workOrders?.byStatus ?? {})) {
      rows.push([status, count as number])
    }
    rows.push([''])

    rows.push(['Top Vendors by Spend', 'Spend', 'WO Count'])
    for (const v of report.vendors?.topBySpend ?? []) {
      rows.push([v.name, v.spend, v.count])
    }

    const csv = rows.map(r => r.map(c => `"${c ?? ''}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const scope = report.isPortfolio ? 'portfolio' : report.property?.name?.replace(/\s+/g, '-')
    a.href = url; a.download = `report-${scope}-${month}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  function printPDF() {
    window.print()
  }

  const expiringBucketColor = (bucket: string) => bucket === '30' ? 'danger' : bucket === '60' ? 'warning' : 'info'

  return (
    <div>
      <PageHeader title="Reporting" subtitle="Monthly operations summary — property or portfolio" />

      <div className="flex flex-wrap gap-3 mb-6 print:hidden">
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[220px]" value={propertyId} onChange={e => setPropertyId(e.target.value)}>
          <option value="">Portfolio (all properties)</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="month" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={month} onChange={e => setMonth(e.target.value)} />
        <Button onClick={runReport} disabled={loading}>{loading ? 'Loading…' : 'Run Report'}</Button>
        {report && !report.error && (
          <>
            <Button variant="ghost" onClick={downloadCSV}><Download className="h-4 w-4 mr-2" /> CSV</Button>
            <Button variant="ghost" onClick={printPDF}><Printer className="h-4 w-4 mr-2" /> PDF</Button>
          </>
        )}
      </div>

      {!report && !loading && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">Select a period and run the report.</p>
          <p className="text-sm">Leave property blank for a portfolio-wide report.</p>
        </div>
      )}

      {report && report.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">{report.error}</div>
      )}

      {report && !report.error && (
        <div className="space-y-6" ref={printRef}>
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {report.isPortfolio ? 'Portfolio Report' : report.property?.name}
              </h2>
              {!report.isPortfolio && report.property && (
                <p className="text-gray-500 text-sm">{report.property.address}, {report.property.city}, {report.property.state}</p>
              )}
              <p className="text-gray-400 text-sm">Period: {report.month}</p>
            </div>
            <div className="flex items-center gap-4 print:hidden">
            <Link href="/dashboard/reporting/rent-roll" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
              <FileText className="h-4 w-4" /> Rent Roll →
            </Link>
            <Link href="/dashboard/reporting/vacancy" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
              <FileText className="h-4 w-4" /> Vacancy →
            </Link>
            <Link href="/dashboard/reporting/benchmarks" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
              <FileText className="h-4 w-4" /> Benchmarks →
            </Link>
            <Link href="/dashboard/reporting/operating-statement" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
              <FileText className="h-4 w-4" /> Operating Statement →
            </Link>
            <Link href="/dashboard/reporting/accounting-export" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
              <FileText className="h-4 w-4" /> Accounting Export →
            </Link>
          </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card><p className="text-sm text-gray-500">Total Units</p><p className="text-2xl font-bold">{report.occupancy?.total}</p></Card>
            <Card>
              <p className="text-sm text-gray-500">Occupancy Rate</p>
              <p className="text-2xl font-bold">{report.occupancy?.rate}%</p>
              <p className="text-xs text-gray-400">{report.occupancy?.occupied} occupied</p>
            </Card>
            <Card>
              <p className="text-sm text-gray-500">Active Leases</p>
              <p className="text-2xl font-bold">{report.leases?.active}</p>
              {(report.leases?.expiring30 ?? 0) > 0 && (
                <p className="text-xs text-red-500">{report.leases?.expiring30} expiring in 30d</p>
              )}
            </Card>
            <Card><p className="text-sm text-gray-500">Work Orders</p><p className="text-2xl font-bold">{report.workOrders?.total}</p></Card>
          </div>

          {/* Financials chart */}
          {(() => {
            const financials = report.financials
            const finChartData = [
              { label: 'Income', value: financials?.income ?? 0, fill: '#22c55e' },
              { label: 'Expenses', value: financials?.expenses ?? 0, fill: '#ef4444' },
              { label: 'NOI', value: Math.abs(financials?.noi ?? 0), fill: financials?.noi >= 0 ? '#3b82f6' : '#f97316' },
            ]
            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <h3 className="font-semibold text-gray-900 mb-1">Financials</h3>
                  <p className="text-xs text-gray-400 mb-4">Income vs Expenses vs NOI</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={finChartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={48} />
                      <Tooltip formatter={(value: number | undefined) => formatCurrency(value ?? 0)} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {finChartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Income</span>
                      <span className="font-medium text-green-700">+{formatCurrency(financials?.income)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Expenses</span>
                      <span className="font-medium text-red-700">-{formatCurrency(financials?.expenses)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold border-t border-gray-100 pt-1.5">
                      <span>NOI</span>
                      <span className={financials?.noi >= 0 ? 'text-green-700' : 'text-red-700'}>
                        {formatCurrency(financials?.noi)}
                      </span>
                    </div>
                  </div>
                </Card>

                {(() => {
                  const woStatus = report.workOrders?.byStatus ?? {}
                  const STATUS_COLORS: Record<string, string> = {
                    NEW: '#3b82f6', ASSIGNED: '#8b5cf6', IN_PROGRESS: '#f59e0b',
                    BLOCKED: '#ef4444', COMPLETED: '#22c55e', CANCELED: '#9ca3af',
                  }
                  const woChartData = Object.entries(woStatus).map(([status, count]) => ({
                    status: status.replace(/_/g, ' '),
                    count: count as number,
                    fill: STATUS_COLORS[status] ?? '#94a3b8',
                  }))
                  return (
                    <Card>
                      <h3 className="font-semibold text-gray-900 mb-1">Work Orders by Status</h3>
                      <p className="text-xs text-gray-400 mb-4">Total: {report.workOrders?.total ?? 0}</p>
                      {woChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={woChartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="status" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                            <Tooltip />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                              {woChartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-[200px] text-gray-300 text-sm">No work orders this period</div>
                      )}
                    </Card>
                  )
                })()}
              </div>
            )
          })()}

          {/* Lease Expirations */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Lease Expirations</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-700">{report.leases?.expiring30}</p>
                <p className="text-xs text-red-500 mt-1">Next 30 days</p>
              </div>
              <div className="text-center p-3 bg-yellow-50 rounded-lg">
                <p className="text-2xl font-bold text-yellow-700">{report.leases?.expiring60}</p>
                <p className="text-xs text-yellow-600 mt-1">31 – 60 days</p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-700">{report.leases?.expiring90}</p>
                <p className="text-xs text-blue-500 mt-1">61 – 90 days</p>
              </div>
            </div>
            {report.leases?.expiringList?.length > 0 && (
              <div className="space-y-2 mt-2">
                {report.leases.expiringList.map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
                    <div>
                      <span className="font-medium">{l.tenant?.user?.name}</span>
                      <span className="text-gray-400 mx-2">·</span>
                      <span className="text-gray-500">Unit {l.unit?.unitNumber}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs">{formatDate(l.endDate)}</span>
                      <Badge variant={expiringBucketColor(l.bucket)}>{l.bucket}d</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {(report.leases?.expiringList?.length ?? 0) === 0 && (
              <p className="text-sm text-gray-400">No leases expiring in the next 90 days.</p>
            )}
          </Card>

          {/* Portfolio property breakdown */}
          {report.isPortfolio && report.properties?.length > 0 && (
            <Card padding="none">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Property Breakdown</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Property</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Units</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Occupancy</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Open WOs</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">NOI</th>
                  </tr>
                </thead>
                <tbody>
                  {report.properties.map((p: any) => (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 font-medium">{p.name}</td>
                      <td className="px-4 py-2 text-gray-500">{p.units}</td>
                      <td className="px-4 py-2 text-gray-500">{p.occupancyRate}%</td>
                      <td className="px-4 py-2 text-gray-500">{p.openWorkOrders}</td>
                      <td className={`px-4 py-2 font-medium ${p.noi >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(p.noi)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {/* Vendor spend */}
          {report.vendors?.topBySpend?.length > 0 && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">Top Vendors by Spend</h3>
              <div className="space-y-2">
                {report.vendors.topBySpend.map((v: any, i: number) => (
                  <div key={v.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 text-sm w-5">{i + 1}.</span>
                      <span className="font-medium text-sm">{v.name}</span>
                      <span className="text-xs text-gray-400">{v.count} work order{v.count !== 1 ? 's' : ''}</span>
                    </div>
                    <span className="font-semibold text-sm">{formatCurrency(v.spend)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* WO Analytics */}
          {report.workOrders?.analytics?.avgResolutionByCategory?.length > 0 && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-1">Work Order Analytics</h3>
              <p className="text-xs text-gray-400 mb-4">Avg resolution time by category (last 90 days) · Repeat repairs: {report.workOrders.analytics.repeatRepairCount}</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={report.workOrders.analytics.avgResolutionByCategory} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="category" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}h`} width={36} />
                  <Tooltip formatter={(value: number | undefined) => [`${value ?? 0}h`, 'Avg Resolution']} />
                  <Bar dataKey="avgHours" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Ledger entries detail */}
          {report.financials?.ledgerEntries?.length > 0 && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">Ledger Entries This Period</h3>
              <div className="space-y-2">
                {report.financials.ledgerEntries.map((e: any) => (
                  <div key={e.id} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm text-gray-700">{e.type.replace(/_/g, ' ')}</p>
                      {e.memo && <p className="text-xs text-gray-400">{e.memo}</p>}
                    </div>
                    <span className={`font-medium text-sm ${e.amount >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {e.amount >= 0 ? '+' : ''}{formatCurrency(e.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Leasing Velocity — always visible, updates with propertyId filter */}
      {leasingVelocity && (
        <Card className="mt-6">
          <h3 className="font-semibold text-gray-900 mb-1">Leasing Velocity</h3>
          <p className="text-xs text-gray-400 mb-4">Average days to fill a vacancy (last 12 months)</p>
          <div className="flex items-center gap-6 mb-4">
            <div>
              <p className="text-3xl font-bold text-gray-900">
                {leasingVelocity.avgDaysToFill !== null ? leasingVelocity.avgDaysToFill : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">avg days to fill</p>
            </div>
          </div>
          {leasingVelocity.byMonth?.some((m: any) => m.avgDaysToFill !== null) ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={leasingVelocity.byMonth} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}d`} width={32} />
                <Tooltip formatter={(value: number | undefined) => [`${value ?? 0} days`, 'Avg Days to Fill']} />
                <Line type="monotone" dataKey="avgDaysToFill" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[180px] text-gray-300 text-sm">Not enough vacancy data yet</div>
          )}
          {leasingVelocity.byProperty?.filter((p: any) => p.count > 0).length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-3 space-y-1.5">
              {leasingVelocity.byProperty.filter((p: any) => p.count > 0).map((p: any) => (
                <div key={p.id} className="flex justify-between text-sm">
                  <span className="text-gray-600">{p.name}</span>
                  <span className="font-medium">{p.avgDaysToFill !== null ? `${p.avgDaysToFill}d` : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Renewal Analytics — always visible */}
      {renewalData && (
        <Card className="mt-6">
          <h3 className="font-semibold text-gray-900 mb-1">Renewal Analytics</h3>
          <p className="text-xs text-gray-400 mb-4">Offer conversion + upcoming pipeline</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{renewalData.totalOffers}</p>
              <p className="text-xs text-gray-500 mt-1">Total Offers</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-700">{renewalData.accepted}</p>
              <p className="text-xs text-green-600 mt-1">Accepted</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <p className="text-2xl font-bold text-red-700">{renewalData.declined}</p>
              <p className="text-xs text-red-500 mt-1">Declined</p>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-700">
                {renewalData.acceptanceRate !== null ? `${renewalData.acceptanceRate}%` : '—'}
              </p>
              <p className="text-xs text-blue-500 mt-1">Acceptance Rate</p>
            </div>
          </div>
          {renewalData.pipeline?.length > 0 ? (
            <>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Upcoming Renewals (≤90 days)</h4>
              <div className="space-y-2">
                {renewalData.pipeline.map((p: any) => (
                  <div key={p.leaseId} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0 text-sm">
                    <div>
                      <span className="font-medium">{p.tenantName}</span>
                      <span className="text-gray-400 mx-2">·</span>
                      <span className="text-gray-500">Unit {p.unitNumber}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs">{formatDate(p.endDate)}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${p.daysLeft <= 30 ? 'bg-red-50 text-red-700' : p.daysLeft <= 60 ? 'bg-yellow-50 text-yellow-700' : 'bg-blue-50 text-blue-700'}`}>
                        {p.daysLeft}d
                      </span>
                      {p.offerStatus ? (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          p.offerStatus === 'ACCEPTED' ? 'bg-green-50 text-green-700' :
                          p.offerStatus === 'DECLINED' ? 'bg-red-50 text-red-700' :
                          p.offerStatus === 'EXPIRED' ? 'bg-gray-100 text-gray-500' :
                          'bg-purple-50 text-purple-700'
                        }`}>{p.offerStatus}</span>
                      ) : (
                        <span className="text-xs text-gray-300">No offer</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400">No leases expiring in the next 90 days.</p>
          )}
        </Card>
      )}

      {/* AI Portfolio Summary */}
      <Card className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">
              <Wand2 className="h-4 w-4 text-indigo-600" /> AI Portfolio Summary
            </h3>
            {summaryGeneratedAt && (
              <p className="text-xs text-gray-400 mt-0.5">Generated at {summaryGeneratedAt.toLocaleTimeString()}</p>
            )}
          </div>
          <button
            onClick={generateAISummary}
            disabled={generatingSummary}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Wand2 className="h-3.5 w-3.5" />
            {generatingSummary ? 'Generating…' : 'Generate AI Summary'}
          </button>
        </div>
        {!aiSummary && !generatingSummary && (
          <p className="text-sm text-gray-400">Click the button above to generate an AI-powered executive summary of your portfolio.</p>
        )}
        {(aiSummary || generatingSummary) && (
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {aiSummary}
            {generatingSummary && <span className="animate-pulse">…</span>}
          </p>
        )}
      </Card>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body > * { display: none; }
          .print\\:hidden { display: none !important; }
          nav, header, aside { display: none !important; }
        }
      `}</style>
    </div>
  )
}
