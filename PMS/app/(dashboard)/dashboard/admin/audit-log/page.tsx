'use client'

import { useEffect, useState, useCallback } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { formatDate } from '@/lib/utils'
import { Download, ChevronDown, ChevronRight, ChevronLeft as ChevronLeftIcon, ChevronsLeft, ChevronsRight, ChevronRight as ChevronRightIcon } from 'lucide-react'

const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const BTN_GHOST = 'px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors'

const ACTION_COLORS: Record<string, 'info' | 'success' | 'danger' | 'warning'> = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
  STATUS_CHANGE: 'warning',
}

const ENTITY_TYPES = [
  '', 'Property', 'Unit', 'Lease', 'LedgerEntry', 'WorkOrder', 'Vendor', 'User',
  'Tenant', 'Incident', 'Inspection', 'ComplianceItem', 'Document', 'Asset',
]

const ACTIONS = ['', 'CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE']

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filters
  const [entityType, setEntityType] = useState('')
  const [entityId, setEntityId] = useState('')
  const [action, setAction] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Pagination
  const [page, setPage] = useState(0)
  const pageSize = 30

  // Expanded rows (for JSON diff)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (entityType) params.set('entityType', entityType)
    if (entityId) params.set('entityId', entityId)
    if (action) params.set('action', action)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    params.set('skip', String(page * pageSize))
    params.set('take', String(pageSize))

    const res = await fetch(`/api/audit?${params}`)
    if (res.ok) {
      const data = await res.json()
      setLogs(data.logs ?? [])
      setTotal(data.total ?? 0)
    }
    setLoading(false)
  }, [entityType, entityId, action, dateFrom, dateTo, page])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  function applyFilters() {
    setPage(0)
    fetchLogs()
  }

  function resetFilters() {
    setEntityType('')
    setEntityId('')
    setAction('')
    setDateFrom('')
    setDateTo('')
    setPage(0)
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function exportCsv() {
    const params = new URLSearchParams()
    if (entityType) params.set('entityType', entityType)
    if (entityId) params.set('entityId', entityId)
    if (action) params.set('action', action)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    params.set('export', 'csv')

    const res = await fetch(`/api/audit?${params}`)
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Track all changes across the system"
        action={
          <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        }
      />

      {/* Filters */}
      <Card className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Entity Type</label>
            <select className={INPUT_CLS} value={entityType} onChange={e => setEntityType(e.target.value)}>
              <option value="">All</option>
              {ENTITY_TYPES.filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Entity ID</label>
            <input className={INPUT_CLS} value={entityId} onChange={e => setEntityId(e.target.value)} placeholder="Filter by entity ID" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
            <select className={INPUT_CLS} value={action} onChange={e => setAction(e.target.value)}>
              <option value="">All</option>
              {ACTIONS.filter(Boolean).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input type="date" className={INPUT_CLS} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input type="date" className={INPUT_CLS} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={resetFilters} className={BTN_GHOST}>Reset</button>
          <button onClick={applyFilters} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Apply</button>
        </div>
      </Card>

      {/* Results */}
      <Card padding="none">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-500">{total.toLocaleString()} record{total !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader className="w-8" />
                  <TableHeader>Timestamp</TableHeader>
                  <TableHeader>Actor</TableHeader>
                  <TableHeader>Action</TableHeader>
                  <TableHeader>Entity</TableHeader>
                  <TableHeader>Entity ID</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.length === 0 && <TableEmptyState message="No audit log entries found" />}
                {logs.map((log: any) => (
                  <>
                    <TableRow key={log.id} className="cursor-pointer hover:bg-gray-50" onClick={() => toggleExpand(log.id)}>
                      <TableCell className="w-8">
                        {expanded.has(log.id) ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500 whitespace-nowrap">{formatDate(log.createdAt)}</TableCell>
                      <TableCell className="text-sm">
                        <span className="text-gray-900 font-medium">{log.actor?.name ?? log.actor?.email ?? '—'}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={ACTION_COLORS[log.action] ?? 'default'}>{log.action}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-700">{log.entityType}</TableCell>
                      <TableCell className="text-sm text-gray-500 font-mono text-xs">{log.entityId ? log.entityId.slice(0, 12) + '…' : '—'}</TableCell>
                    </TableRow>
                    {expanded.has(log.id) && (
                      <TableRow key={`${log.id}-diff`}>
                        <TableCell colSpan={6} className="bg-gray-50 p-0">
                          <div className="px-6 py-4">
                            <p className="text-xs font-medium text-gray-500 mb-2">Change Details</p>
                            <pre className="text-xs bg-gray-900 text-green-400 rounded-lg p-4 overflow-x-auto max-h-64 overflow-y-auto">
                              {JSON.stringify(log.diff ?? {}, null, 2)}
                            </pre>
                            <p className="text-xs text-gray-400 mt-2">
                              Full Entity ID: {log.entityId ?? 'N/A'}
                              {log.actorUserId && <> | Actor ID: {log.actorUserId}</>}
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(0)} disabled={page === 0} className={`${BTN_GHOST} disabled:opacity-30`}>
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className={`${BTN_GHOST} disabled:opacity-30`}>
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className={`${BTN_GHOST} disabled:opacity-30`}>
                <ChevronRightIcon className="h-4 w-4" />
              </button>
              <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className={`${BTN_GHOST} disabled:opacity-30`}>
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
