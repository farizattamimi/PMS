'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatsCard } from '@/components/ui/StatsCard'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { WorkOrderPriorityBadge, WorkOrderStatusBadge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import { Wrench, Clock, CheckCircle, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

const STATUS_STEPS = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'] as const

function StatusTimeline({ current }: { current: string }) {
  const idx = STATUS_STEPS.indexOf(current as any)
  return (
    <div className="flex items-center gap-1">
      {STATUS_STEPS.map((step, i) => {
        const reached = i <= idx
        return (
          <div key={step} className="flex items-center gap-1">
            <div
              className={`h-2 w-2 rounded-full ${reached ? 'bg-blue-600' : 'bg-gray-200'}`}
              title={step.replace('_', ' ')}
            />
            {i < STATUS_STEPS.length - 1 && (
              <div className={`h-0.5 w-4 ${i < idx ? 'bg-blue-600' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function SlaCountdown({ hours, breached, urgency }: { hours: number | null; breached: boolean; urgency: string }) {
  if (hours === null) return <span className="text-xs text-gray-400">No SLA</span>

  const absHours = Math.abs(hours)
  let display: string
  if (absHours >= 24) {
    const days = Math.floor(absHours / 24)
    const rem = Math.round(absHours % 24)
    display = `${days}d ${rem}h`
  } else {
    display = `${Math.round(absHours * 10) / 10}h`
  }

  const colorCls = urgency === 'red'
    ? 'text-red-700 bg-red-50 border-red-200'
    : urgency === 'yellow'
      ? 'text-yellow-700 bg-yellow-50 border-yellow-200'
      : 'text-green-700 bg-green-50 border-green-200'

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${colorCls}`}>
      <Clock className="h-3 w-3" />
      {breached ? `Overdue by ${display}` : `${display} left`}
    </span>
  )
}

export default function MyMaintenancePage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/portal/sla')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  const { active = [], completed = [], stats = {} } = data ?? {}

  return (
    <div>
      <PageHeader title="My Maintenance" subtitle="Track your work order status and SLA timelines" />

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatsCard
          title="Active Work Orders"
          value={stats.totalActive ?? 0}
          subtitle={stats.breachedCount > 0 ? `${stats.breachedCount} breached SLA` : 'All within SLA'}
          icon={Wrench}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <StatsCard
          title="On-Time %"
          value={`${stats.onTimePct ?? 100}%`}
          subtitle="Completed within SLA"
          icon={CheckCircle}
          iconColor="text-green-600"
          iconBg="bg-green-50"
        />
        <StatsCard
          title="Avg Resolution"
          value={stats.avgResolutionHours > 0 ? `${stats.avgResolutionHours}h` : '—'}
          subtitle="Average resolution time"
          icon={Clock}
          iconColor="text-purple-600"
          iconBg="bg-purple-50"
        />
      </div>

      {/* Active work orders */}
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Active Work Orders</h2>
      {active.length === 0 ? (
        <Card className="mb-6 text-center py-8">
          <CheckCircle className="h-10 w-10 text-green-300 mx-auto mb-2" />
          <p className="text-gray-500">No active work orders. All caught up!</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {active.map((wo: any) => (
            <Card key={wo.id} className="relative">
              <div className="flex items-start justify-between mb-2">
                <Link
                  href={`/dashboard/workorders/${wo.id}`}
                  className="font-medium text-blue-600 hover:underline text-sm leading-tight"
                >
                  {wo.title}
                </Link>
                <WorkOrderPriorityBadge priority={wo.priority} />
              </div>

              <div className="flex items-center gap-3 mb-3">
                <WorkOrderStatusBadge status={wo.status} />
                <SlaCountdown
                  hours={wo.timeRemainingHours}
                  breached={wo.breached}
                  urgency={wo.urgency}
                />
              </div>

              <div className="mb-3">
                <StatusTimeline current={wo.status} />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                {wo.property && <span>{wo.property.name}</span>}
                {wo.unit && <span>Unit {wo.unit.unitNumber}</span>}
                {wo.assignedVendor && <span>Vendor: {wo.assignedVendor.name}</span>}
                <span>Submitted {formatDate(wo.createdAt)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Completed work orders */}
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Completed Work Orders</h2>
      <Card padding="none">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Date</TableHeader>
              <TableHeader>Title</TableHeader>
              <TableHeader>Priority</TableHeader>
              <TableHeader>Resolution Time</TableHeader>
              <TableHeader>SLA Met</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {completed.length === 0 && <TableEmptyState message="No completed work orders yet" />}
            {completed.map((wo: any) => (
              <TableRow key={wo.id}>
                <TableCell className="text-gray-500 text-sm">{formatDate(wo.completedAt ?? wo.createdAt)}</TableCell>
                <TableCell>
                  <Link href={`/dashboard/workorders/${wo.id}`} className="font-medium text-blue-600 hover:underline text-sm">
                    {wo.title}
                  </Link>
                </TableCell>
                <TableCell><WorkOrderPriorityBadge priority={wo.priority} /></TableCell>
                <TableCell className="text-sm text-gray-600">
                  {wo.resolutionHours >= 24
                    ? `${Math.floor(wo.resolutionHours / 24)}d ${Math.round(wo.resolutionHours % 24)}h`
                    : `${wo.resolutionHours}h`}
                </TableCell>
                <TableCell>
                  {wo.metSla === true ? (
                    <span className="inline-flex items-center gap-1 text-green-700 text-sm font-medium">
                      <CheckCircle className="h-4 w-4" /> Yes
                    </span>
                  ) : wo.metSla === false ? (
                    <span className="inline-flex items-center gap-1 text-red-700 text-sm font-medium">
                      <AlertTriangle className="h-4 w-4" /> No
                    </span>
                  ) : (
                    <span className="text-gray-400 text-sm">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
