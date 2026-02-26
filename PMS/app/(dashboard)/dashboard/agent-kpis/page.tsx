'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, Gauge, TrendingUp, TrendingDown, AlertOctagon,
  CheckCircle, Activity, RefreshCw, BarChart2,
} from 'lucide-react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend,
} from 'recharts'
import { StatsCard } from '@/components/ui/StatsCard'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

interface KPIData {
  period: { days: number; since: string }
  runs: {
    total: number
    completed: number
    escalated: number
    failed: number
    running: number
    queued: number
    terminal: number
    autonomousRate: number | null
    escalationRate: number | null
    failureRate: number | null
  }
  workflowBreakdown: { workflow: string; count: number }[]
  triggerBreakdown: { triggerType: string; count: number }[]
  exceptions: {
    openCount: number
    criticalOpen: number
    bySeverity: { severity: string; count: number }[]
    byCategory: { category: string; count: number }[]
  }
  dailyTrend: { date: string; completed: number; escalated: number; failed: number }[]
}

const SEVERITY_CONFIG: Record<string, { variant: 'danger' | 'warning' | 'info' | 'gray'; label: string }> = {
  CRITICAL: { variant: 'danger',  label: 'Critical' },
  HIGH:     { variant: 'warning', label: 'High' },
  MEDIUM:   { variant: 'info',    label: 'Medium' },
  LOW:      { variant: 'gray',    label: 'Low' },
}

const WORKFLOW_LABELS: Record<string, string> = {
  MAINTENANCE:   'Maintenance',
  TENANT_COMMS:  'Tenant Comms',
  COMPLIANCE_PM: 'Compliance/PM',
  OTHER:         'Manual/Other',
}

const PERIOD_OPTIONS = [
  { label: '7d',  value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
]

function fmt(n: number | null, suffix = '%'): string {
  if (n === null) return '—'
  return `${n}${suffix}`
}

export default function AgentKPIsPage() {
  const [data, setData] = useState<KPIData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [days, setDays] = useState(30)

  const load = useCallback(async () => {
    setRefreshing(true)
    const res = await fetch(`/api/agent/kpis?days=${days}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
    setRefreshing(false)
  }, [days])

  useEffect(() => { load() }, [load])

  // Compact trend labels: show every Nth day depending on period
  const trendData = data?.dailyTrend.map(d => ({
    ...d,
    label: d.date.slice(5), // MM-DD
  })) ?? []

  const statusBarData = data
    ? [
        { name: 'Completed', count: data.runs.completed, fill: '#22c55e' },
        { name: 'Escalated', count: data.runs.escalated, fill: '#f59e0b' },
        { name: 'Failed',    count: data.runs.failed,    fill: '#ef4444' },
        { name: 'Running',   count: data.runs.running,   fill: '#3b82f6' },
        { name: 'Queued',    count: data.runs.queued,    fill: '#94a3b8' },
      ].filter(s => s.count > 0)
    : []

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <Link href="/dashboard" className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Dashboard
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Gauge className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Autonomous Ops KPIs</h1>
            <p className="text-sm text-gray-500">Agent performance metrics</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setDays(opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  days === opt.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={load} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading…</div>
      ) : !data ? (
        <div className="text-center py-20 text-red-400">Failed to load KPI data.</div>
      ) : (
        <div className="space-y-6">

          {/* ── Top Stats ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="Autonomous Resolution"
              value={fmt(data.runs.autonomousRate)}
              subtitle={`${data.runs.completed} of ${data.runs.terminal} terminal runs`}
              icon={CheckCircle}
              iconColor="text-green-600"
              iconBg="bg-green-50"
            />
            <StatsCard
              title="Escalation Rate"
              value={fmt(data.runs.escalationRate)}
              subtitle={`${data.runs.escalated} escalated`}
              icon={TrendingUp}
              iconColor={data.runs.escalationRate !== null && data.runs.escalationRate > 30 ? 'text-red-500' : 'text-yellow-600'}
              iconBg={data.runs.escalationRate !== null && data.runs.escalationRate > 30 ? 'bg-red-50' : 'bg-yellow-50'}
            />
            <StatsCard
              title="Total Runs"
              value={data.runs.total}
              subtitle={`Last ${data.period.days} days`}
              icon={Activity}
              iconColor="text-blue-600"
              iconBg="bg-blue-50"
            />
            <StatsCard
              title="Open Exceptions"
              value={data.exceptions.openCount}
              subtitle={data.exceptions.criticalOpen > 0 ? `${data.exceptions.criticalOpen} critical` : 'None critical'}
              icon={AlertOctagon}
              iconColor={data.exceptions.criticalOpen > 0 ? 'text-red-600' : 'text-gray-500'}
              iconBg={data.exceptions.criticalOpen > 0 ? 'bg-red-50' : 'bg-gray-50'}
            />
          </div>

          {/* ── Charts row ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Run Outcomes */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <BarChart2 className="h-4 w-4 text-blue-500" />
                <h2 className="font-semibold text-gray-900 text-sm">Run Outcomes</h2>
              </div>
              <p className="text-xs text-gray-400 mb-4">By final status</p>
              {statusBarData.length === 0 ? (
                <p className="text-center py-10 text-gray-400 text-sm">No runs in this period</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={statusBarData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {statusBarData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Open Exceptions by Category */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <AlertOctagon className="h-4 w-4 text-yellow-500" />
                <h2 className="font-semibold text-gray-900 text-sm">Open Exceptions by Category</h2>
              </div>
              <p className="text-xs text-gray-400 mb-4">Currently unresolved</p>
              {data.exceptions.byCategory.length === 0 ? (
                <p className="text-center py-10 text-gray-400 text-sm">No open exceptions</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.exceptions.byCategory} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* ── Daily Trend ── */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-indigo-500" />
              <h2 className="font-semibold text-gray-900 text-sm">Daily Run Volume</h2>
            </div>
            <p className="text-xs text-gray-400 mb-4">Completed / Escalated / Failed per day</p>
            {trendData.every(d => d.completed === 0 && d.escalated === 0 && d.failed === 0) ? (
              <p className="text-center py-10 text-gray-400 text-sm">No completed runs in this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    interval={days <= 7 ? 0 : days <= 30 ? 4 : 9}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="completed" stroke="#22c55e" strokeWidth={2} dot={false} name="Completed" />
                  <Line type="monotone" dataKey="escalated" stroke="#f59e0b" strokeWidth={2} dot={false} name="Escalated" />
                  <Line type="monotone" dataKey="failed"    stroke="#ef4444" strokeWidth={2} dot={false} name="Failed" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* ── Bottom row: Workflow Breakdown + Severity ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Workflow Breakdown */}
            <Card className="p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-4">Workflow Breakdown</h2>
              {data.workflowBreakdown.length === 0 ? (
                <p className="text-center py-6 text-gray-400 text-sm">No runs in this period</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b">
                      <th className="pb-2 font-medium">Workflow</th>
                      <th className="pb-2 font-medium text-right">Runs</th>
                      <th className="pb-2 font-medium text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.workflowBreakdown.map(row => (
                      <tr key={row.workflow} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 text-gray-700">{WORKFLOW_LABELS[row.workflow] ?? row.workflow}</td>
                        <td className="py-2 text-right font-mono text-gray-900">{row.count}</td>
                        <td className="py-2 text-right text-gray-500">
                          {data.runs.total > 0 ? `${Math.round(row.count / data.runs.total * 100)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            {/* Open Exceptions by Severity */}
            <Card className="p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-4">Open Exceptions by Severity</h2>
              {data.exceptions.bySeverity.length === 0 ? (
                <p className="text-center py-6 text-gray-400 text-sm">No open exceptions</p>
              ) : (
                <div className="space-y-3">
                  {data.exceptions.bySeverity.map(row => {
                    const cfg = SEVERITY_CONFIG[row.severity] ?? { variant: 'gray' as const, label: row.severity }
                    const pct = data.exceptions.openCount > 0
                      ? Math.round(row.count / data.exceptions.openCount * 100)
                      : 0
                    return (
                      <div key={row.severity} className="flex items-center gap-3">
                        <Badge variant={cfg.variant} className="w-20 justify-center text-xs">
                          {cfg.label}
                        </Badge>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              row.severity === 'CRITICAL' ? 'bg-red-500' :
                              row.severity === 'HIGH'     ? 'bg-amber-400' :
                              row.severity === 'MEDIUM'   ? 'bg-blue-400' : 'bg-gray-400'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-gray-900 w-8 text-right">{row.count}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              {data.exceptions.openCount > 0 && (
                <div className="mt-4 pt-3 border-t">
                  <Link
                    href="/dashboard/agent-exceptions"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View all exceptions →
                  </Link>
                </div>
              )}
            </Card>
          </div>

          {/* Trigger breakdown */}
          {data.triggerBreakdown.length > 0 && (
            <Card className="p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-4">Run Trigger Types</h2>
              <div className="flex gap-6 flex-wrap">
                {data.triggerBreakdown.map(row => (
                  <div key={row.triggerType} className="text-center">
                    <p className="text-2xl font-bold text-gray-900">{row.count}</p>
                    <p className="text-xs text-gray-500 mt-0.5 capitalize">{row.triggerType}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

        </div>
      )}
    </div>
  )
}
