'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, Activity, RefreshCw, AlertCircle, CheckCircle, Clock, XCircle, Zap } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

interface AgentRun {
  id: string
  triggerType: string
  triggerRef: string | null
  propertyId: string | null
  status: string
  startedAt: string | null
  completedAt: string | null
  summary: string | null
  error: string | null
  createdAt: string
  _count: { steps: number; exceptions: number }
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gray'; icon: React.ComponentType<{ className?: string }> }> = {
  QUEUED:    { label: 'Queued',    variant: 'gray',    icon: Clock },
  RUNNING:   { label: 'Running',   variant: 'info',    icon: RefreshCw },
  COMPLETED: { label: 'Completed', variant: 'success', icon: CheckCircle },
  FAILED:    { label: 'Failed',    variant: 'danger',  icon: XCircle },
  ESCALATED: { label: 'Escalated', variant: 'warning', icon: AlertCircle },
}

function formatDate(d: string) {
  return new Date(d).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function duration(start: string | null, end: string | null): string {
  if (!start) return '—'
  const ms = new Date(end ?? Date.now()).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

export default function AgentRunsPage() {
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    const qs = statusFilter ? `?status=${statusFilter}` : ''
    const res = await fetch(`/api/agent/runs${qs}`)
    if (res.ok) setRuns(await res.json())
    setLoading(false)
    setRefreshing(false)
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  const statuses = ['', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'ESCALATED']

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/dashboard" className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Dashboard
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Activity className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agent Runs</h1>
            <p className="text-sm text-gray-500">Autonomous workflow execution history</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === s
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading runs…</div>
      ) : runs.length === 0 ? (
        <Card className="p-12 text-center">
          <Activity className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No runs yet</p>
          <p className="text-sm text-gray-400 mt-1">Runs appear here when the agent processes events or schedules.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {runs.map(run => {
            const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.FAILED
            const Icon = cfg.icon
            return (
              <Link key={run.id} href={`/dashboard/agent-runs/${run.id}`}>
                <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                        run.status === 'COMPLETED' ? 'text-green-500' :
                        run.status === 'FAILED' ? 'text-red-500' :
                        run.status === 'ESCALATED' ? 'text-yellow-500' :
                        run.status === 'RUNNING' ? 'text-blue-500 animate-spin' :
                        'text-gray-400'
                      }`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                          <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                            {run.triggerType}
                          </span>
                          {run.propertyId && (
                            <span className="text-xs text-gray-500">
                              property: {run.propertyId.slice(0, 8)}…
                            </span>
                          )}
                        </div>
                        {run.summary && (
                          <p className="text-sm text-gray-700 mt-1 truncate">{run.summary}</p>
                        )}
                        {run.error && (
                          <p className="text-sm text-red-600 mt-1 truncate">{run.error}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                          <span>{formatDate(run.createdAt)}</span>
                          <span>·</span>
                          <span>{duration(run.startedAt, run.completedAt)}</span>
                          <span>·</span>
                          <span>{run._count.steps} step{run._count.steps !== 1 ? 's' : ''}</span>
                          {run._count.exceptions > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-yellow-600">{run._count.exceptions} exception{run._count.exceptions !== 1 ? 's' : ''}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <Zap className="h-4 w-4 text-gray-300 flex-shrink-0 mt-1" />
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
