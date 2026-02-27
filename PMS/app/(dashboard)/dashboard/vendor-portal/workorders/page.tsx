'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { WorkOrderPriorityBadge, WorkOrderStatusBadge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'

interface WO {
  id: string
  title: string
  status: string
  priority: string
  category: string
  slaDate: string | null
  createdAt: string
  property: { name: string }
  unit: { unitNumber: string } | null
}

const STATUSES = ['', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELED']

export default function VendorWorkOrdersPage() {
  const [wos, setWos]       = useState<WO[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const qs = filter ? `?status=${filter}` : ''
    const res = await fetch(`/api/vendor-portal/workorders${qs}`)
    const data = await res.json()
    setWos(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const now = new Date()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/dashboard/vendor-portal" className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Vendor Portal
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Work Orders</h1>

      {/* Status filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === s
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : wos.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-gray-500 font-medium">No work orders found.</p>
          {filter && <p className="text-sm text-gray-400 mt-1">Try clearing the filter.</p>}
        </Card>
      ) : (
        <div className="space-y-3">
          {wos.map(wo => {
            const isOverdue = wo.slaDate && new Date(wo.slaDate) < now && !['COMPLETED', 'CANCELED'].includes(wo.status)
            return (
              <Link key={wo.id} href={`/dashboard/vendor-portal/workorders/${wo.id}`}>
                <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <WorkOrderStatusBadge status={wo.status} />
                        <WorkOrderPriorityBadge priority={wo.priority} />
                        <span className="text-xs text-gray-400 font-mono">{wo.category}</span>
                        {isOverdue && (
                          <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                            <AlertTriangle className="h-3 w-3" /> SLA overdue
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-gray-900">{wo.title}</p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {wo.property.name}
                        {wo.unit && ` · Unit ${wo.unit.unitNumber}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 text-xs text-gray-400">
                      <p>{formatDate(wo.createdAt)}</p>
                      {wo.slaDate && (
                        <p className={`mt-1 ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
                          SLA: {new Date(wo.slaDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
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
