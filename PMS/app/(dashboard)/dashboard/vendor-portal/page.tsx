'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Wrench, Clock, CheckCircle, AlertTriangle, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { WorkOrderPriorityBadge, WorkOrderStatusBadge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'

interface WO {
  id: string
  title: string
  status: string
  priority: string
  slaDate: string | null
  createdAt: string
  property: { name: string }
  unit: { unitNumber: string } | null
}

interface Stats {
  total: number
  inProgress: number
  completed: number
  overdueSla: number
}

export default function VendorPortalHome() {
  const { data: session } = useSession()
  const [wos, setWos]       = useState<WO[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/vendor-portal/workorders')
      .then(r => r.json())
      .then(data => { setWos(Array.isArray(data) ? data : []); setLoading(false) })
  }, [])

  const now = new Date()
  const stats: Stats = {
    total:      wos.length,
    inProgress: wos.filter(w => w.status === 'IN_PROGRESS').length,
    completed:  wos.filter(w => w.status === 'COMPLETED').length,
    overdueSla: wos.filter(w =>
      w.slaDate && new Date(w.slaDate) < now &&
      !['COMPLETED', 'CANCELED'].includes(w.status)
    ).length,
  }

  const active = wos
    .filter(w => !['COMPLETED', 'CANCELED'].includes(w.status))
    .slice(0, 5)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Wrench className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendor Portal</h1>
          <p className="text-sm text-gray-500">Welcome back, {session?.user?.name}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Assigned',  value: stats.total,      icon: Wrench,        color: 'text-blue-600',   bg: 'bg-blue-50' },
          { label: 'In Progress',     value: stats.inProgress, icon: Clock,         color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'Completed',       value: stats.completed,  icon: CheckCircle,   color: 'text-green-600',  bg: 'bg-green-50' },
          { label: 'Overdue SLA',     value: stats.overdueSla, icon: AlertTriangle, color: 'text-red-600',    bg: 'bg-red-50' },
        ].map(s => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-3">
              <div className={`${s.bg} p-2 rounded-lg`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Active WOs */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Active Work Orders</h2>
        <Link href="/dashboard/vendor-portal/workorders" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
          View all <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : active.length === 0 ? (
        <Card className="p-10 text-center">
          <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">All caught up!</p>
          <p className="text-sm text-gray-400 mt-1">No active work orders.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {active.map(wo => {
            const isOverdue = wo.slaDate && new Date(wo.slaDate) < now
            return (
              <Link key={wo.id} href={`/dashboard/vendor-portal/workorders/${wo.id}`}>
                <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{wo.title}</p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {wo.property.name}
                        {wo.unit && ` · Unit ${wo.unit.unitNumber}`}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <WorkOrderStatusBadge status={wo.status} />
                        <WorkOrderPriorityBadge priority={wo.priority} />
                        {isOverdue && (
                          <span className="text-xs font-medium text-red-600 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> SLA overdue
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-400">{formatDate(wo.createdAt)}</p>
                      {wo.slaDate && (
                        <p className={`text-xs mt-1 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                          Due {new Date(wo.slaDate).toLocaleDateString()}
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

      {/* Quick links */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link href="/dashboard/vendor-portal/workorders">
          <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer flex items-center gap-3">
            <Wrench className="h-5 w-5 text-blue-500" />
            <span className="font-medium text-sm">All Work Orders</span>
            <ChevronRight className="h-4 w-4 text-gray-400 ml-auto" />
          </Card>
        </Link>
        <Link href="/dashboard/vendor-portal/profile">
          <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <span className="font-medium text-sm">My Profile & Credentials</span>
            <ChevronRight className="h-4 w-4 text-gray-400 ml-auto" />
          </Card>
        </Link>
      </div>
    </div>
  )
}
