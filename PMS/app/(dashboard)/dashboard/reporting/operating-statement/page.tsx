'use client'

import { useEffect, useState, useRef } from 'react'
import { ChevronLeft, Download, Printer } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  Line, ComposedChart,
} from 'recharts'

const TYPE_LABELS: Record<string, string> = {
  RENT: 'Rental Income',
  DEPOSIT: 'Security Deposits',
  LATE_FEE: 'Late Fees',
  OTHER_INCOME: 'Other Income',
  MAINTENANCE_EXPENSE: 'Maintenance & Repairs',
  UTILITY: 'Utilities',
  OTHER_EXPENSE: 'Other Expenses',
}

const COST_TYPE_LABELS: Record<string, string> = {
  LABOR: 'Labor',
  PARTS: 'Parts',
  CONTRACTOR: 'Contractor',
  OTHER: 'Other',
}

const COST_TYPE_COLORS: Record<string, string> = {
  LABOR: '#3b82f6',
  PARTS: '#8b5cf6',
  CONTRACTOR: '#f59e0b',
  OTHER: '#6b7280',
}

export default function OperatingStatementPage() {
  const [properties, setProperties] = useState<any[]>([])
  const [propertyId, setPropertyId] = useState('')
  const now = new Date().toISOString().slice(0, 7)
  const [startMonth, setStartMonth] = useState(now)
  const [endMonth, setEndMonth] = useState(now)
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [showLedger, setShowLedger] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/properties').then((r) => r.json()).then(setProperties)
  }, [])

  async function runReport() {
    if (!startMonth || !endMonth) return
    setLoading(true)
    const params = new URLSearchParams({ startMonth, endMonth })
    if (propertyId) params.set('propertyId', propertyId)
    const res = await fetch(`/api/reports/operating-statement?${params}`)
    setReport(await res.json())
    setLoading(false)
  }

  function downloadCSV() {
    if (!report) return
    const rows: (string | number)[][] = [
      ['Operating Statement / P&L Report'],
      ['Property', report.propertyName],
      ['Period', `${report.startMonth} to ${report.endMonth}`],
      ['Generated', new Date().toLocaleDateString()],
      [''],
      report.hasBudgets
        ? ['Category', 'Actual', 'Budget', 'Variance']
        : ['Category', 'Actual'],
      [''],
      ['REVENUE'],
    ]

    const revTypes = ['RENT', 'DEPOSIT', 'LATE_FEE', 'OTHER_INCOME']
    for (const t of revTypes) {
      const line = report.revenue[t]
      if (!line) continue
      const row: (string | number)[] = [TYPE_LABELS[t] ?? t, line.actual]
      if (report.hasBudgets) {
        row.push(line.budget ?? '', line.variance ?? '')
      }
      rows.push(row)
    }
    rows.push(
      report.hasBudgets
        ? ['TOTAL REVENUE', report.revenue.total, '', '']
        : ['TOTAL REVENUE', report.revenue.total],
    )
    rows.push([''])
    rows.push(['OPERATING EXPENSES'])

    const expTypes = ['MAINTENANCE_EXPENSE', 'UTILITY', 'OTHER_EXPENSE']
    for (const t of expTypes) {
      const line = report.expenses[t]
      if (!line) continue
      const row: (string | number)[] = [TYPE_LABELS[t] ?? t, line.actual]
      if (report.hasBudgets) {
        row.push(line.budget ?? '', line.variance ?? '')
      }
      rows.push(row)
    }
    rows.push(
      report.hasBudgets
        ? ['TOTAL EXPENSES', report.expenses.total, '', '']
        : ['TOTAL EXPENSES', report.expenses.total],
    )
    rows.push([''])
    rows.push(
      report.hasBudgets
        ? ['NET OPERATING INCOME', report.noi, report.noiBudget ?? '', report.noiVariance ?? '']
        : ['NET OPERATING INCOME', report.noi],
    )

    if (report.maintenanceBreakdown?.length > 0) {
      rows.push([''])
      rows.push(['MAINTENANCE BREAKDOWN'])
      rows.push(['Cost Type', 'Amount'])
      for (const m of report.maintenanceBreakdown) {
        rows.push([COST_TYPE_LABELS[m.category] ?? m.category, m.amount])
      }
    }

    if (report.ledgerEntries?.length > 0) {
      rows.push([''])
      rows.push(['LEDGER DETAIL'])
      rows.push(['Date', 'Type', 'Memo', 'Amount'])
      for (const e of report.ledgerEntries) {
        rows.push([
          new Date(e.effectiveDate).toLocaleDateString(),
          TYPE_LABELS[e.type] ?? e.type,
          e.memo ?? '',
          e.amount,
        ])
      }
    }

    const csv = rows.map((r) => r.map((c) => `"${c ?? ''}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const scope = report.isPortfolio ? 'portfolio' : report.propertyName?.replace(/\s+/g, '-')
    a.href = url
    a.download = `operating-statement-${scope}-${report.startMonth}-to-${report.endMonth}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const noiMargin = report && report.revenue?.total > 0
    ? Math.round((report.noi / report.revenue.total) * 100)
    : 0

  const revTypes = ['RENT', 'DEPOSIT', 'LATE_FEE', 'OTHER_INCOME']
  const expTypes = ['MAINTENANCE_EXPENSE', 'UTILITY', 'OTHER_EXPENSE']

  function varianceColor(variance: number | null, isExpense: boolean) {
    if (variance === null) return ''
    // For revenue: positive variance = favorable (green), negative = unfavorable (red)
    // For expenses: positive variance = unfavorable (red), negative = favorable (green)
    const favorable = isExpense ? variance < 0 : variance > 0
    if (variance === 0) return 'text-gray-500'
    return favorable ? 'text-green-700' : 'text-red-700'
  }

  return (
    <div>
      <Link href="/dashboard/reporting" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 print:hidden">
        <ChevronLeft className="h-4 w-4" /> Back to Reporting
      </Link>
      <PageHeader
        title="Operating Statement"
        subtitle="Income vs expense P&L report by property"
      />

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6 print:hidden">
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[220px]"
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
        >
          <option value="">Portfolio (all properties)</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">From</label>
          <input
            type="month"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={startMonth}
            onChange={(e) => setStartMonth(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">To</label>
          <input
            type="month"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={endMonth}
            onChange={(e) => setEndMonth(e.target.value)}
          />
        </div>
        <Button onClick={runReport} disabled={loading}>
          {loading ? 'Loading...' : 'Run Report'}
        </Button>
        {report && !report.error && (
          <>
            <Button variant="ghost" onClick={downloadCSV}>
              <Download className="h-4 w-4 mr-2" /> CSV
            </Button>
            <Button variant="ghost" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" /> PDF
            </Button>
          </>
        )}
      </div>

      {!report && !loading && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">Select a property and period, then run the report.</p>
          <p className="text-sm">Leave property blank for a portfolio-wide P&L.</p>
        </div>
      )}

      {report && report.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
          {report.error}
        </div>
      )}

      {report && !report.error && (
        <div className="space-y-6" ref={printRef}>
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{report.propertyName}</h2>
              <p className="text-gray-500 text-sm">
                Period: {report.startMonth}
                {report.startMonth !== report.endMonth && ` to ${report.endMonth}`}
              </p>
              <p className="text-gray-400 text-xs">
                Generated {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <p className="text-sm text-gray-500">Total Revenue</p>
              <p className="text-2xl font-bold text-green-700">
                {formatCurrency(report.revenue?.total)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-gray-500">Total Expenses</p>
              <p className="text-2xl font-bold text-red-700">
                {formatCurrency(report.expenses?.total)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-gray-500">Net Operating Income</p>
              <p className={`text-2xl font-bold ${report.noi >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatCurrency(report.noi)}
              </p>
              {report.noiVariance !== null && (
                <p className={`text-xs mt-0.5 ${report.noiVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {report.noiVariance >= 0 ? '+' : ''}{formatCurrency(report.noiVariance)} vs budget
                </p>
              )}
            </Card>
            <Card>
              <p className="text-sm text-gray-500">NOI Margin</p>
              <p className={`text-2xl font-bold ${noiMargin >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                {noiMargin}%
              </p>
            </Card>
          </div>

          {/* P&L Table */}
          <Card padding="none">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Profit & Loss Statement</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-2 text-xs font-medium text-gray-500">Category</th>
                  <th className="text-right px-6 py-2 text-xs font-medium text-gray-500">Actual</th>
                  {report.hasBudgets && (
                    <>
                      <th className="text-right px-6 py-2 text-xs font-medium text-gray-500">Budget</th>
                      <th className="text-right px-6 py-2 text-xs font-medium text-gray-500">Variance</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {/* Revenue section */}
                <tr className="bg-green-50/50">
                  <td colSpan={report.hasBudgets ? 4 : 2} className="px-6 py-2 font-semibold text-gray-700 text-xs uppercase tracking-wide">
                    Revenue
                  </td>
                </tr>
                {revTypes.map((t) => {
                  const line = report.revenue[t]
                  if (!line || line.actual === 0) return null
                  return (
                    <tr key={t} className="border-t border-gray-50">
                      <td className="px-6 py-2.5 pl-10 text-gray-700">{TYPE_LABELS[t]}</td>
                      <td className="px-6 py-2.5 text-right font-medium">{formatCurrency(line.actual)}</td>
                      {report.hasBudgets && (
                        <>
                          <td className="px-6 py-2.5 text-right text-gray-500">
                            {line.budget !== null ? formatCurrency(line.budget) : '\u2014'}
                          </td>
                          <td className={`px-6 py-2.5 text-right font-medium ${varianceColor(line.variance, false)}`}>
                            {line.variance !== null
                              ? `${line.variance >= 0 ? '+' : ''}${formatCurrency(line.variance)}`
                              : '\u2014'}
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
                <tr className="border-t border-gray-200 bg-green-50/30">
                  <td className="px-6 py-2 font-semibold text-gray-900">Total Revenue</td>
                  <td className="px-6 py-2 text-right font-bold text-green-700">
                    {formatCurrency(report.revenue.total)}
                  </td>
                  {report.hasBudgets && (
                    <>
                      <td className="px-6 py-2 text-right text-gray-500">&nbsp;</td>
                      <td className="px-6 py-2 text-right">&nbsp;</td>
                    </>
                  )}
                </tr>

                {/* Spacer */}
                <tr><td colSpan={report.hasBudgets ? 4 : 2} className="h-2" /></tr>

                {/* Expense section */}
                <tr className="bg-red-50/50">
                  <td colSpan={report.hasBudgets ? 4 : 2} className="px-6 py-2 font-semibold text-gray-700 text-xs uppercase tracking-wide">
                    Operating Expenses
                  </td>
                </tr>
                {expTypes.map((t) => {
                  const line = report.expenses[t]
                  if (!line || line.actual === 0) return null
                  return (
                    <tr key={t} className="border-t border-gray-50">
                      <td className="px-6 py-2.5 pl-10 text-gray-700">{TYPE_LABELS[t]}</td>
                      <td className="px-6 py-2.5 text-right font-medium">{formatCurrency(line.actual)}</td>
                      {report.hasBudgets && (
                        <>
                          <td className="px-6 py-2.5 text-right text-gray-500">
                            {line.budget !== null ? formatCurrency(line.budget) : '\u2014'}
                          </td>
                          <td className={`px-6 py-2.5 text-right font-medium ${varianceColor(line.variance, true)}`}>
                            {line.variance !== null
                              ? `${line.variance >= 0 ? '+' : ''}${formatCurrency(line.variance)}`
                              : '\u2014'}
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
                <tr className="border-t border-gray-200 bg-red-50/30">
                  <td className="px-6 py-2 font-semibold text-gray-900">Total Expenses</td>
                  <td className="px-6 py-2 text-right font-bold text-red-700">
                    {formatCurrency(report.expenses.total)}
                  </td>
                  {report.hasBudgets && (
                    <>
                      <td className="px-6 py-2 text-right text-gray-500">&nbsp;</td>
                      <td className="px-6 py-2 text-right">&nbsp;</td>
                    </>
                  )}
                </tr>

                {/* Spacer */}
                <tr><td colSpan={report.hasBudgets ? 4 : 2} className="h-2" /></tr>

                {/* NOI */}
                <tr className="border-t-2 border-gray-300 bg-gray-50">
                  <td className="px-6 py-3 font-bold text-gray-900">Net Operating Income</td>
                  <td className={`px-6 py-3 text-right font-bold text-lg ${report.noi >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatCurrency(report.noi)}
                  </td>
                  {report.hasBudgets && (
                    <>
                      <td className="px-6 py-3 text-right font-medium text-gray-500">
                        {report.noiBudget !== null ? formatCurrency(report.noiBudget) : '\u2014'}
                      </td>
                      <td className={`px-6 py-3 text-right font-bold ${
                        report.noiVariance !== null
                          ? report.noiVariance >= 0 ? 'text-green-700' : 'text-red-700'
                          : ''
                      }`}>
                        {report.noiVariance !== null
                          ? `${report.noiVariance >= 0 ? '+' : ''}${formatCurrency(report.noiVariance)}`
                          : '\u2014'}
                      </td>
                    </>
                  )}
                </tr>
              </tbody>
            </table>
          </Card>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Maintenance Cost Breakdown */}
            {report.maintenanceBreakdown?.length > 0 && (
              <Card>
                <h3 className="font-semibold text-gray-900 mb-1">Maintenance Cost Breakdown</h3>
                <p className="text-xs text-gray-400 mb-4">By cost type</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={report.maintenanceBreakdown.map((m: any) => ({
                      name: COST_TYPE_LABELS[m.category] ?? m.category,
                      amount: m.amount,
                      fill: COST_TYPE_COLORS[m.category] ?? '#6b7280',
                    }))}
                    layout="vertical"
                    margin={{ top: 4, right: 8, left: 60, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={60} />
                    <Tooltip formatter={(value: number | undefined) => formatCurrency(value ?? 0)} />
                    <Bar dataKey="amount" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Monthly Trend */}
            {report.monthlyTrend?.length > 0 && (
              <Card>
                <h3 className="font-semibold text-gray-900 mb-1">Monthly Trend</h3>
                <p className="text-xs text-gray-400 mb-4">Revenue, expenses & NOI — last 6 months</p>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={report.monthlyTrend} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={48} />
                    <Tooltip formatter={(value: number | undefined) => formatCurrency(value ?? 0)} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="noi" name="NOI" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>
            )}
          </div>

          {/* Ledger Detail */}
          {report.ledgerEntries?.length > 0 && (
            <Card>
              <button
                onClick={() => setShowLedger(!showLedger)}
                className="w-full flex items-center justify-between"
              >
                <h3 className="font-semibold text-gray-900">
                  Ledger Detail ({report.ledgerEntries.length} entries)
                </h3>
                <span className="text-sm text-blue-600">
                  {showLedger ? 'Hide' : 'Show'}
                </span>
              </button>
              {showLedger && (
                <div className="mt-4 space-y-2">
                  {report.ledgerEntries.map((e: any) => (
                    <div key={e.id} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">
                            {new Date(e.effectiveDate).toLocaleDateString()}
                          </span>
                          <span className="text-sm text-gray-700">
                            {TYPE_LABELS[e.type] ?? e.type.replace(/_/g, ' ')}
                          </span>
                        </div>
                        {e.memo && <p className="text-xs text-gray-400">{e.memo}</p>}
                      </div>
                      <span className={`font-medium text-sm ${e.amount >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {e.amount >= 0 ? '+' : ''}{formatCurrency(e.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          .print\\:hidden { display: none !important; }
          nav, header, aside { display: none !important; }
        }
      `}</style>
    </div>
  )
}
