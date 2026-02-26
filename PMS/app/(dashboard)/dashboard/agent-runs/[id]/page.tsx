'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, CheckCircle, XCircle, Clock, AlertCircle, RefreshCw, Activity } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

interface AgentStep {
  id: string
  stepOrder: number
  name: string
  status: string
  inputJson: Record<string, unknown> | null
  outputJson: Record<string, unknown> | null
  startedAt: string | null
  completedAt: string | null
  error: string | null
}

interface AgentActionLog {
  id: string
  stepId: string | null
  actionType: string
  target: string
  requestJson: Record<string, unknown> | null
  responseJson: Record<string, unknown> | null
  policyDecision: string | null
  policyReason: string | null
  createdAt: string
}

interface AgentException {
  id: string
  severity: string
  category: string
  title: string
  details: string
  status: string
  createdAt: string
}

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
  steps: AgentStep[]
  actionLogs: AgentActionLog[]
  exceptions: AgentException[]
}

const STEP_STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  PLANNED: Clock,
  RUNNING: RefreshCw,
  DONE:    CheckCircle,
  FAILED:  XCircle,
  SKIPPED: Clock,
}

const SEVERITY_VARIANT: Record<string, 'gray' | 'warning' | 'danger'> = {
  LOW:      'gray',
  MEDIUM:   'warning',
  HIGH:     'danger',
  CRITICAL: 'danger',
}

const ACTION_TYPE_COLOR: Record<string, string> = {
  API_CALL:     'bg-blue-50 text-blue-700',
  DECISION:     'bg-purple-50 text-purple-700',
  ESCALATION:   'bg-red-50 text-red-700',
  MEMORY_READ:  'bg-teal-50 text-teal-700',
  MEMORY_WRITE: 'bg-teal-50 text-teal-700',
}

function formatDate(d: string) {
  return new Date(d).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'ESCALATED'])

export default function AgentRunDetailPage({ params }: { params: { id: string } }) {
  const [run, setRun]         = useState<AgentRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [live, setLive]       = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [activeTab, setActiveTab]   = useState<'steps' | 'logs' | 'exceptions'>('steps')
  const esRef = useRef<EventSource | null>(null)

  function connect() {
    if (esRef.current) { esRef.current.close(); esRef.current = null }
    setLive(false)

    const es = new EventSource(`/api/agent/runs/${params.id}/stream`)
    esRef.current = es

    es.onopen = () => setLive(true)

    es.onmessage = (e) => {
      try {
        const { run: updated, live: isLive } = JSON.parse(e.data)
        setRun(updated)
        setLoading(false)
        setLive(!!isLive)
        if (!isLive) {
          es.close()
          esRef.current = null
        }
      } catch {}
    }

    es.onerror = () => {
      setLive(false)
      // Let EventSource auto-reconnect unless run is terminal
      if (run && TERMINAL.has(run.status)) {
        es.close()
        esRef.current = null
      }
    }
  }

  useEffect(() => {
    connect()
    return () => { esRef.current?.close(); esRef.current = null }
  }, [params.id])

  async function cancel() {
    if (!confirm('Cancel this run?')) return
    setCancelling(true)
    await fetch(`/api/agent/runs/${params.id}/cancel`, { method: 'POST' })
    // Force a fresh fetch after cancellation
    const res = await fetch(`/api/agent/runs/${params.id}`)
    if (res.ok) setRun(await res.json())
    setCancelling(false)
  }

  if (loading) return <div className="p-6 text-gray-400">Loading…</div>
  if (!run)    return <div className="p-6 text-red-600">Run not found</div>

  const canCancel = run.status === 'QUEUED' || run.status === 'RUNNING'
  const isActive  = !TERMINAL.has(run.status)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/dashboard/agent-runs" className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Agent Runs
        </Link>
      </div>

      {/* Header */}
      <Card className="p-5 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Activity className="h-5 w-5 text-blue-600" />
              <span className="font-mono text-sm text-gray-500">{run.id}</span>
              <Badge variant={
                run.status === 'COMPLETED' ? 'success' :
                run.status === 'FAILED'    ? 'danger'  :
                run.status === 'ESCALATED' ? 'warning' : 'info'
              }>
                {run.status}
              </Badge>
              {/* Live indicator */}
              {isActive && (
                <div className="flex items-center gap-1 ml-1">
                  <span className={`h-2 w-2 rounded-full ${live ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                  <span className={`text-xs ${live ? 'text-green-600' : 'text-gray-400'}`}>
                    {live ? 'Live' : 'Reconnecting…'}
                  </span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-3">
              <div>
                <span className="text-gray-400 text-xs">Trigger</span>
                <p className="font-medium">{run.triggerType}</p>
              </div>
              <div>
                <span className="text-gray-400 text-xs">Created</span>
                <p className="font-medium">{formatDate(run.createdAt)}</p>
              </div>
              {run.startedAt && (
                <div>
                  <span className="text-gray-400 text-xs">Started</span>
                  <p className="font-medium">{formatDate(run.startedAt)}</p>
                </div>
              )}
              {run.completedAt && (
                <div>
                  <span className="text-gray-400 text-xs">Completed</span>
                  <p className="font-medium">{formatDate(run.completedAt)}</p>
                </div>
              )}
            </div>
            {run.summary && <p className="text-sm text-gray-700 mt-3">{run.summary}</p>}
            {run.error   && <p className="text-sm text-red-600 mt-3 font-medium">{run.error}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!live && !TERMINAL.has(run.status) && (
              <Button variant="ghost" size="sm" onClick={connect}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Reconnect
              </Button>
            )}
            {canCancel && (
              <Button variant="ghost" size="sm" onClick={cancel} disabled={cancelling}>
                {cancelling ? 'Cancelling…' : 'Cancel'}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b">
        {(['steps', 'logs', 'exceptions'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
            {tab === 'steps'      && ` (${run.steps.length})`}
            {tab === 'logs'       && ` (${run.actionLogs.length})`}
            {tab === 'exceptions' && run.exceptions.length > 0 && ` (${run.exceptions.length})`}
          </button>
        ))}
      </div>

      {/* Steps tab */}
      {activeTab === 'steps' && (
        <div className="space-y-2">
          {run.steps.length === 0 && (
            <p className="text-gray-400 text-sm py-6 text-center">
              {isActive ? 'Waiting for steps…' : 'No steps recorded.'}
            </p>
          )}
          {run.steps.map(step => {
            const Icon = STEP_STATUS_ICON[step.status] ?? Clock
            return (
              <Card key={step.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-400 font-mono w-6 text-center">{step.stepOrder}</span>
                    <Icon className={`h-5 w-5 ${
                      step.status === 'DONE'    ? 'text-green-500' :
                      step.status === 'FAILED'  ? 'text-red-500' :
                      step.status === 'RUNNING' ? 'text-blue-500 animate-spin' :
                      'text-gray-400'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{step.name}</span>
                      <Badge variant={step.status === 'DONE' ? 'success' : step.status === 'FAILED' ? 'danger' : 'gray'}>
                        {step.status}
                      </Badge>
                    </div>
                    {step.error && (
                      <p className="text-xs text-red-600 mt-1">{step.error}</p>
                    )}
                    {step.outputJson && (
                      <pre className="text-xs text-gray-600 bg-gray-50 rounded p-2 mt-2 overflow-x-auto">
                        {JSON.stringify(step.outputJson, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Action logs tab */}
      {activeTab === 'logs' && (
        <div className="space-y-2">
          {run.actionLogs.length === 0 && (
            <p className="text-gray-400 text-sm py-6 text-center">
              {isActive ? 'Waiting for action logs…' : 'No action logs.'}
            </p>
          )}
          {run.actionLogs.map(log => (
            <Card key={log.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${ACTION_TYPE_COLOR[log.actionType] ?? 'bg-gray-100 text-gray-700'}`}>
                      {log.actionType}
                    </span>
                    <span className="text-sm font-medium">{log.target}</span>
                    {log.policyDecision && (
                      <Badge variant={
                        log.policyDecision === 'ALLOW' ? 'success' :
                        log.policyDecision === 'BLOCK' ? 'danger' : 'warning'
                      }>
                        {log.policyDecision}
                      </Badge>
                    )}
                  </div>
                  {log.policyReason && (
                    <p className="text-xs text-gray-500 mt-1">{log.policyReason}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(log.createdAt)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Exceptions tab */}
      {activeTab === 'exceptions' && (
        <div className="space-y-2">
          {run.exceptions.length === 0 && (
            <p className="text-gray-400 text-sm py-6 text-center">No exceptions for this run.</p>
          )}
          {run.exceptions.map(ex => (
            <Card key={ex.id} className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                  ex.severity === 'CRITICAL' ? 'text-red-600' :
                  ex.severity === 'HIGH'     ? 'text-orange-500' :
                  'text-yellow-500'
                }`} />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={SEVERITY_VARIANT[ex.severity] ?? 'gray'}>
                      {ex.severity}
                    </Badge>
                    <span className="text-xs font-mono text-gray-400">{ex.category}</span>
                  </div>
                  <p className="font-medium text-sm mt-1">{ex.title}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{ex.details}</p>
                  <Link
                    href={`/dashboard/agent-exceptions?id=${ex.id}`}
                    className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                  >
                    View in exceptions inbox →
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
