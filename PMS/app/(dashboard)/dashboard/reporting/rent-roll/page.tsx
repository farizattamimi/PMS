'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, Download, FileText } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { formatCurrency, formatDate } from '@/lib/utils'

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'Vacant',
  OCCUPIED: 'Occupied',
  DOWN: 'Down',
  MODEL: 'Model',
}

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'default'> = {
  AVAILABLE: 'warning',
  OCCUPIED: 'success',
  DOWN: 'danger',
  MODEL: 'info',
}

const EXPIRY_COLOR = (days: number | null) => {
  if (days === null) return ''
  if (days <= 30) return 'text-red-600 font-semibold'
  if (days <= 60) return 'text-yellow-600 font-medium'
  return 'text-gray-600'
}

export default function RentRollPage() {
  const [properties, setProperties] = useState<any[]>([])
  const [propertyId, setPropertyId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [rows, setRows] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/properties').then(r => r.json()).then(setProperties)
  }, [])

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (propertyId) params.set('propertyId', propertyId)
    if (statusFilter) params.set('status', statusFilter)
    const res = await fetch(`/api/reports/rent-roll?${params}`)
    setRows(await res.json())
    setLoading(false)
  }

  function downloadCSV() {
    if (!rows) return
    const headers = ['Property', 'Unit', 'Building', 'Status', 'Beds', 'Baths', 'Sq Ft', 'Monthly Rent', 'Tenant', 'Tenant Email', 'Lease Start', 'Lease End', 'Days Until Expiry']
    const csvRows = rows.map(r => [
      r.propertyName,
      r.unitNumber,
      r.building ?? '',
      STATUS_LABEL[r.status] ?? r.status,
      r.bedrooms,
      r.bathrooms,
      r.sqFt,
      r.monthlyRent,
      r.tenant?.name ?? '',
      r.tenant?.email ?? '',
      r.leaseStart ? formatDate(r.leaseStart) : '',
      r.leaseEnd ? formatDate(r.leaseEnd) : '',
      r.daysUntilExpiry ?? '',
    ])
    const csv = [headers, ...csvRows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `rent-roll-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // Computed summary stats
  const totalUnits = rows?.length ?? 0
  const occupied = rows?.filter(r => r.status === 'OCCUPIED').length ?? 0
  const vacant = rows?.filter(r => r.status === 'AVAILABLE').length ?? 0
  const totalRent = rows?.reduce((s, r) => s + (r.monthlyRent ?? 0), 0) ?? 0
  const occupiedRent = rows?.filter(r => r.status === 'OCCUPIED').reduce((s, r) => s + (r.monthlyRent ?? 0), 0) ?? 0
  const expiring30 = rows?.filter(r => r.daysUntilExpiry !== null && r.daysUntilExpiry <= 30).length ?? 0
  const occupancyRate = totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0

  return (
    <div>
      <Link href="/dashboard/reporting" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="h-4 w-4" /> Back to Reporting
      </Link>
      <PageHeader
        title="Rent Roll"
        subtitle="Unit-level occupancy and lease snapshot"
        action={
          rows && rows.length > 0 ? (
            <button
              onClick={downloadCSV}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[200px]"
          value={propertyId}
          onChange={e => setPropertyId(e.target.value)}
        >
          <option value="">All Properties</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="OCCUPIED">Occupied</option>
          <option value="AVAILABLE">Vacant</option>
          <option value="DOWN">Down</option>
          <option value="MODEL">Model</option>
        </select>
        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Loading…' : 'Run Report'}
        </button>
      </div>

      {!rows && !loading && (
        <div className="text-center py-16 text-gray-400">
          <FileText className="h-10 w-10 mx-auto mb-3 text-gray-200" />
          <p className="text-lg mb-1">Select filters and run the report.</p>
          <p className="text-sm">Leave property blank for all properties.</p>
        </div>
      )}

      {rows && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <p className="text-sm text-gray-500 mb-1">Total Units</p>
              <p className="text-2xl font-bold text-gray-900">{totalUnits}</p>
            </Card>
            <Card>
              <p className="text-sm text-gray-500 mb-1">Occupancy Rate</p>
              <p className={`text-2xl font-bold ${occupancyRate >= 80 ? 'text-green-700' : occupancyRate >= 60 ? 'text-yellow-600' : 'text-red-700'}`}>
                {occupancyRate}%
              </p>
              <p className="text-xs text-gray-400">{occupied} occupied · {vacant} vacant</p>
            </Card>
            <Card>
              <p className="text-sm text-gray-500 mb-1">Potential Rent</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalRent)}</p>
              <p className="text-xs text-gray-400">/ mo if 100% occupied</p>
            </Card>
            <Card>
              <p className="text-sm text-gray-500 mb-1">Collected Rent</p>
              <p className="text-2xl font-bold text-green-700">{formatCurrency(occupiedRent)}</p>
              {expiring30 > 0 && (
                <p className="text-xs text-red-500">{expiring30} lease{expiring30 !== 1 ? 's' : ''} expiring in 30d</p>
              )}
            </Card>
          </div>

          {/* Rent Roll Table */}
          <Card padding="none">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Unit List ({rows.length})</h3>
              {expiring30 > 0 && (
                <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full font-medium">
                  {expiring30} expiring soon
                </span>
              )}
            </div>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Property / Unit</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Size</TableHeader>
                  <TableHeader>Rent</TableHeader>
                  <TableHeader>Tenant</TableHeader>
                  <TableHeader>Lease End</TableHeader>
                  <TableHeader>Days Left</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 && <TableEmptyState message="No units match the selected filters" />}
                {rows.map(r => (
                  <TableRow key={r.unitId}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{r.propertyName}</p>
                        <p className="text-xs text-gray-400">
                          {r.building ? `${r.building} · ` : ''}Unit {r.unitNumber}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status] ?? 'default'}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {r.bedrooms}BR/{r.bathrooms}BA
                      {r.sqFt ? <span className="text-gray-400 ml-1">· {r.sqFt.toLocaleString()} ft²</span> : null}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{formatCurrency(r.monthlyRent)}</TableCell>
                    <TableCell>
                      {r.tenant ? (
                        <div>
                          <p className="text-sm text-gray-900">{r.tenant.name}</p>
                          <p className="text-xs text-gray-400">{r.tenant.email}</p>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {r.leaseEnd ? formatDate(r.leaseEnd) : '—'}
                    </TableCell>
                    <TableCell>
                      {r.daysUntilExpiry !== null ? (
                        <span className={`text-sm ${EXPIRY_COLOR(r.daysUntilExpiry)}`}>
                          {r.daysUntilExpiry}d
                        </span>
                      ) : (
                        <span className="text-gray-300 text-sm">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  )
}
