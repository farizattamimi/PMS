'use client'

import { useEffect, useState, useCallback } from 'react'
import { Bot, ChevronLeft, CheckCircle, XCircle } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'

type BadgeVariant = 'warning' | 'info' | 'success' | 'gray' | 'danger'

const STATUS_BADGE: Record<string, BadgeVariant> = {
  PENDING_APPROVAL: 'warning',
  AUTO_EXECUTED: 'info',
  APPROVED: 'success',
  REJECTED: 'gray',
  FAILED: 'danger',
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: 'Pending Approval',
  AUTO_EXECUTED: 'Auto-Executed',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  FAILED: 'Failed',
}

const ACTION_TYPE_LABEL: Record<string, string> = {
  SEND_MESSAGE: 'Send Message',
  ASSIGN_VENDOR: 'Assign Vendor',
  SEND_BID_REQUEST: 'Send Bid Request',
  ACCEPT_BID: 'Accept Bid',
  SEND_RENEWAL_OFFER: 'Send Renewal Offer',
  CREATE_WORK_ORDER: 'Create Work Order',
  CLOSE_THREAD: 'Close Thread',
}

type TabKey = 'pending' | 'history'

export default function AgentInboxPage() {
  const [tab, setTab] = useState<TabKey>('pending')
  const [actions, setActions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<string | null>(null)

  const load = useCallback(async (activeTab: TabKey) => {
    setLoading(true)
    const url =
      activeTab === 'pending'
        ? '/api/agent/inbox?status=PENDING_APPROVAL'
        : '/api/agent/inbox'
    const res = await fetch(url)
    const data = await res.json()
    setActions(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load(tab) }, [tab, load])

  async function handleRunAgent() {
    setRunning(true)
    setRunResult(null)
    try {
      const res = await fetch('/api/agent/run', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setRunResult(`Agent ran: ${data.actionsQueued} queued, ${data.actionsExecuted} auto-executed, ${data.itemsReviewed} items reviewed.`)
        load(tab)
      } else {
        setRunResult(`Error: ${data.error ?? 'Unknown error'}`)
      }
    } finally {
      setRunning(false)
    }
  }

  async function handleApprove(id: string) {
    setProcessingId(id)
    await fetch(`/api/agent/inbox/${id}/approve`, { method: 'POST' })
    await load(tab)
    setProcessingId(null)
  }

  async function handleReject(id: string) {
    setProcessingId(id)
    await fetch(`/api/agent/inbox/${id}/reject`, { method: 'POST' })
    await load(tab)
    setProcessingId(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard" className="flex items-center gap-1 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" /> Dashboard
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <PageHeader title="Agent Inbox" />
        <Button onClick={handleRunAgent} disabled={running}>
          {running ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Running...
            </span>
          ) : (
            'Run Agent Now'
          )}
        </Button>
      </div>

      {runResult && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm px-4 py-3 rounded-lg">
          {runResult}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['pending', 'history'] as TabKey[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'pending' ? 'Pending Approval' : 'History'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading...</div>
      ) : actions.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
          <Bot className="h-12 w-12 opacity-30" />
          <p className="text-sm">
            {tab === 'pending' ? 'No actions pending approval.' : 'No agent actions yet.'}
          </p>
          {tab === 'pending' && (
            <p className="text-xs">Run the agent to generate new actions.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {actions.map((action: any) => {
            const result = action.result as { ok?: boolean; detail?: string; error?: string } | null
            const payload = action.payload as Record<string, unknown>
            return (
              <Card key={action.id}>
                {/* Badge row */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Badge variant={STATUS_BADGE[action.status] ?? 'gray'}>
                    {STATUS_LABEL[action.status] ?? action.status}
                  </Badge>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                    {ACTION_TYPE_LABEL[action.actionType] ?? action.actionType}
                  </span>
                  {action.property && (
                    <span className="text-xs text-gray-500">{action.property.name}</span>
                  )}
                </div>

                {/* Title + reasoning */}
                <h3 className="text-sm font-semibold text-gray-900 mb-1">{String(action.title)}</h3>
                <p className="text-sm text-gray-600 mb-3">{String(action.reasoning)}</p>

                {/* Message body preview */}
                {action.actionType === 'SEND_MESSAGE' && !!payload.body && (
                  <blockquote className="border-l-4 border-gray-200 pl-4 text-sm text-gray-600 italic mb-3 bg-gray-50 py-2 pr-3 rounded-r">
                    {payload.body as string}
                  </blockquote>
                )}

                {/* Result */}
                {result && (
                  <div className="mb-3">
                    {result.ok ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        <CheckCircle className="h-3 w-3" />
                        {(result.detail as string) ?? 'Success'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        <XCircle className="h-3 w-3" />
                        {(result.error as string) ?? 'Failed'}
                      </span>
                    )}
                  </div>
                )}

                {/* Footer: timestamp + actions */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{formatDate(action.createdAt)}</span>
                  {action.status === 'PENDING_APPROVAL' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReject(action.id)}
                        disabled={processingId === action.id}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleApprove(action.id)}
                        disabled={processingId === action.id}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {processingId === action.id ? 'Processing...' : 'Approve'}
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
