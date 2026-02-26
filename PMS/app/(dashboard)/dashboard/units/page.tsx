'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { UnitStatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'

const STATUS_OPTIONS = ['', 'AVAILABLE', 'OCCUPIED', 'DOWN', 'MODEL']

export default function UnitsPage() {
  const [units, setUnits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    const params = statusFilter ? `?status=${statusFilter}` : ''
    fetch(`/api/units${params}`)
      .then(r => r.json())
      .then(setUnits)
      .finally(() => setLoading(false))
  }, [statusFilter])

  return (
    <div>
      <PageHeader title="Units" subtitle={`${units.length} units`} />

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {STATUS_OPTIONS.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              statusFilter === s
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      <Card padding="none">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Unit</TableHeader>
              <TableHeader>Property</TableHeader>
              <TableHeader>Beds/Baths</TableHeader>
              <TableHeader>Sq Ft</TableHeader>
              <TableHeader>Rent</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Tenant</TableHeader>
              <TableHeader></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableEmptyState message="Loading…" />}
            {!loading && units.length === 0 && <TableEmptyState message="No units found" />}
            {units.map(u => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">#{u.unitNumber}</TableCell>
                <TableCell className="text-gray-500">{u.property?.name}</TableCell>
                <TableCell className="text-gray-500">{u.bedrooms}bd / {u.bathrooms}ba</TableCell>
                <TableCell className="text-gray-500">{u.sqFt.toLocaleString()}</TableCell>
                <TableCell>{formatCurrency(u.monthlyRent)}</TableCell>
                <TableCell><UnitStatusBadge status={u.status} /></TableCell>
                <TableCell className="text-gray-500">
                  {u.leases?.[0]?.tenant?.user?.name ?? '—'}
                </TableCell>
                <TableCell>
                  <Link href={`/dashboard/units/${u.id}`}>
                    <Button variant="ghost" size="sm">View</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
