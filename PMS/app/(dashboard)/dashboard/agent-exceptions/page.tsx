'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, AlertOctagon, RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

interface AgentException {
  id: string
  runId: string | null
  propertyId: string | null
  severity: string
  category: string
  title: string
  details: string
  status: string
  requiresBy: string | null
  resolvedAt: string | null
  createdAt: string
}

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-600 bg-red-50',
  HIGH:     'text-orange-600 bg-orange-50',
  MEDIUM:   'text-yellow-600 bg-yellow-50',
  LOW:      'text-gray-600 bg-gray-50',
}

function formatDate(d: string) {
  return new Date(d).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function isUrgent(ex: AgentException): boolean {
  if (ex.status !== 'OPEN') return false
  if (ex.severity === 'CRITICAL' || ex.severity === 'HIGH') return true
  if (ex.requiresBy && new Date(ex.requiresBy) < new Date()) return true
  return false
}

export default function AgentExceptionsPage() {
  const [exceptions, setExceptions] = useState<AgentException[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('OPEN')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    const qs = statusFilter ? `?status=${statusFilter}` : ''
    const res = await fetch(`/api/agent/exceptions${qs}`)
    if (res.ok) {
      const data: AgentException[] = await res.json()
      // Sort by severity then by requiresBy
      data.sort((a, b) => {
        const sa = SEVERITY_ORDER.indexOf(a.severity)
        const sb = SEVERITY_ORDER.indexOf(b.severity)
        if (sa !== sb) return sa - sb
        if (a.requiresBy && b.requiresBy) return new Date(a.requiresBy).getTime() - new Date(b.requiresBy).getTime()
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
      setExceptions(data)
    }
    setLoading(false)
    setRefreshing(false)
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  async function handleAction(id: string, status: 'ACK' | 'RESOLVED') {
    setProcessingId(id)
    await fetch(`/api/agent/exceptions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await load()
    setProcessingId(null)
  }

  const openCount = exceptions.filter(e => e.status === 'OPEN').length
  const criticalCount = exceptions.filter(e => e.severity === 'CRITICAL' && e.status === 'OPEN').length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/dashboard" className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Dashboard
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <AlertOctagon className="h-7 w-7 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agent Exceptions</h1>
            <p className="text-sm text-gray-500">Issues requiring human review or decision</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary pills */}
      {statusFilter === 'OPEN' && !loading && (
        <div className="flex gap-3 mb-6">
          {criticalCount > 0 && (
            <div className="flex items-center gap-2 bg-red-50 text-red-700 rounded-lg px-3 py-2 text-sm font-medium">
              <AlertCircle className="h-4 w-4" />
              {criticalCount} Critical
            </div>
          )}
          <div className="flex items-center gap-2 bg-gray-50 text-gray-700 rounded-lg px-3 py-2 text-sm font-medium">
            <Clock className="h-4 w-4" />
            {openCount} Open
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {['OPEN', 'ACK', 'RESOLVED', ''].map(s => (
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
        <div className="text-center py-12 text-gray-400">Loading exceptions…</div>
      ) : exceptions.length === 0 ? (
        <Card className="p-12 text-center">
          <CheckCircle className="h-12 w-12 text-green-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">
            {statusFilter === 'OPEN' ? 'No open exceptions' : 'No exceptions found'}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {statusFilter === 'OPEN' ? 'The agent is operating within policy bounds.' : 'Try a different filter.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {exceptions.map(ex => (
            <Card
              key={ex.id}
              className={`p-4 ${isUrgent(ex) ? 'border-l-4 border-l-red-500' : ''}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Header row */}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${SEVERITY_COLOR[ex.severity]}`}>
                      {ex.severity}
                    </span>
                    <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                      {ex.category}
                    </span>
                    <Badge variant={
                      ex.status === 'OPEN' ? 'warning' :
                      ex.status === 'ACK' ? 'info' : 'success'
                    }>
                      {ex.status}
                    </Badge>
                    {ex.requiresBy && new Date(ex.requiresBy) < new Date() && ex.status === 'OPEN' && (
                      <span className="text-xs text-red-600 font-medium">⚠ Overdue</span>
                    )}
                  </div>

                  {/* Title + details */}
                  <p className="font-semibold text-gray-900 text-sm">{ex.title}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{ex.details}</p>

                  {/* Meta */}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span>{formatDate(ex.createdAt)}</span>
                    {ex.requiresBy && (
                      <>
                        <span>·</span>
                        <span className={new Date(ex.requiresBy) < new Date() ? 'text-red-500' : ''}>
                          Requires by: {formatDate(ex.requiresBy)}
                        </span>
                      </>
                    )}
                    {ex.runId && (
                      <>
                        <span>·</span>
                        <Link href={`/dashboard/agent-runs/${ex.runId}`} className="text-blue-500 hover:underline">
                          View run →
                        </Link>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {ex.status === 'OPEN' && (
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={processingId === ex.id}
                      onClick={() => handleAction(ex.id, 'ACK')}
                    >
                      Acknowledge
                    </Button>
                    <Button
                      size="sm"
                      disabled={processingId === ex.id}
                      onClick={() => handleAction(ex.id, 'RESOLVED')}
                    >
                      Resolve
                    </Button>
                  </div>
                )}
                {ex.status === 'ACK' && (
                  <Button
                    size="sm"
                    disabled={processingId === ex.id}
                    onClick={() => handleAction(ex.id, 'RESOLVED')}
                  >
                    Resolve
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
