'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { UnitStatusBadge, WorkOrderPriorityBadge, WorkOrderStatusBadge } from '@/components/ui/Badge'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function UnitDetailPage() {
  const { id } = useParams()
  const [unit, setUnit] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/units/${id}`)
      .then(r => r.json())
      .then(setUnit)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
  if (!unit) return <div className="text-center py-20 text-gray-500">Unit not found</div>

  const activeLease = unit.leases?.find((l: any) => l.status === 'ACTIVE')

  return (
    <div>
      <Link href="/dashboard/units" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="h-4 w-4" /> Back to Units
      </Link>

      <PageHeader
        title={`Unit #${unit.unitNumber}`}
        subtitle={`${unit.property?.name} · ${unit.property?.address}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card>
          <p className="text-sm text-gray-500 mb-1">Status</p>
          <UnitStatusBadge status={unit.status} />
          <div className="mt-4 space-y-1 text-sm">
            <p><span className="text-gray-500">Bedrooms:</span> {unit.bedrooms}</p>
            <p><span className="text-gray-500">Bathrooms:</span> {unit.bathrooms}</p>
            <p><span className="text-gray-500">Size:</span> {unit.sqFt.toLocaleString()} sq ft</p>
            <p><span className="text-gray-500">Rent:</span> {formatCurrency(unit.monthlyRent)}/mo</p>
          </div>
        </Card>

        {activeLease && (
          <Card>
            <p className="text-sm text-gray-500 mb-1">Current Tenant</p>
            <p className="font-semibold text-lg">{activeLease.tenant?.user?.name}</p>
            <p className="text-sm text-gray-500">{activeLease.tenant?.user?.email}</p>
            <div className="mt-3 space-y-1 text-sm">
              <p><span className="text-gray-500">Lease start:</span> {formatDate(activeLease.startDate)}</p>
              <p><span className="text-gray-500">Lease end:</span> {formatDate(activeLease.endDate)}</p>
              <p><span className="text-gray-500">Rent:</span> {formatCurrency(activeLease.monthlyRent)}/mo</p>
            </div>
          </Card>
        )}
      </div>

      {/* Ledger History */}
      {activeLease && activeLease.ledgerEntries?.length > 0 && (
        <Card padding="none" className="mb-6">
          <div className="p-6 pb-0">
            <CardHeader>
              <CardTitle>Ledger Entries</CardTitle>
            </CardHeader>
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Date</TableHeader>
                <TableHeader>Type</TableHeader>
                <TableHeader>Memo</TableHeader>
                <TableHeader>Amount</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {activeLease.ledgerEntries?.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="text-gray-500">{formatDate(e.effectiveDate)}</TableCell>
                  <TableCell className="text-gray-500 text-xs">{e.type.replace(/_/g, ' ')}</TableCell>
                  <TableCell className="text-gray-500">{e.memo ?? '—'}</TableCell>
                  <TableCell className={e.amount >= 0 ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>{e.amount >= 0 ? '+' : ''}{formatCurrency(e.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Work Orders */}
      <Card padding="none">
        <div className="p-6 pb-0">
          <CardHeader>
            <CardTitle>Work Orders</CardTitle>
          </CardHeader>
        </div>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Title</TableHeader>
              <TableHeader>Priority</TableHeader>
              <TableHeader>Submitted</TableHeader>
              <TableHeader>Status</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {unit.workOrders?.length === 0 && <TableEmptyState message="No work orders" />}
            {unit.workOrders?.map((w: any) => (
              <TableRow key={w.id}>
                <TableCell className="font-medium">{w.title}</TableCell>
                <TableCell><WorkOrderPriorityBadge priority={w.priority} /></TableCell>
                <TableCell className="text-gray-500">{formatDate(w.createdAt)}</TableCell>
                <TableCell><WorkOrderStatusBadge status={w.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
