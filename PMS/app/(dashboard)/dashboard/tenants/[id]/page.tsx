'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { LeaseStatusBadge, TenantStatusBadge } from '@/components/ui/Badge'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function TenantDetailPage() {
  const { id } = useParams()
  const [tenant, setTenant] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch tenant detail via leases query + tenant direct
    Promise.all([
      fetch(`/api/tenants/${id}`).then(r => r.json()),
    ]).then(([t]) => {
      setTenant(t)
      setLoading(false)
    })
  }, [id])

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
  if (!tenant || tenant.error) return <div className="text-center py-20 text-gray-500">Tenant not found</div>

  return (
    <div>
      <Link href="/dashboard/tenants" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="h-4 w-4" /> Back to Tenants
      </Link>
      <PageHeader title={tenant.user?.name} subtitle={tenant.user?.email} action={<TenantStatusBadge status={tenant.status} />} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <p className="text-sm font-medium text-gray-500 mb-3">Contact Information</p>
          <div className="space-y-2 text-sm">
            <p><span className="text-gray-500">Phone:</span> {tenant.phone}</p>
            <p><span className="text-gray-500">Emergency Contact:</span> {tenant.emergencyContactName}</p>
            <p><span className="text-gray-500">Emergency Phone:</span> {tenant.emergencyContactPhone}</p>
          </div>
        </Card>
      </div>

      {/* Leases */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Lease History</h3>
        <div className="space-y-3">
          {tenant.leases?.map((lease: any) => (
            <Card key={lease.id}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{lease.unit?.property?.name} — Unit #{lease.unit?.unitNumber}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {formatDate(lease.startDate)} → {formatDate(lease.endDate)}
                  </p>
                  <p className="text-sm text-gray-500">Rent: {formatCurrency(lease.monthlyRent)}/mo · Deposit: {formatCurrency(lease.depositAmount)}</p>
                </div>
                <LeaseStatusBadge status={lease.status} />
              </div>
              {/* Ledger entries for this lease */}
              {lease.ledgerEntries?.length > 0 && (
                <div className="mt-4 overflow-x-auto">
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
                      {lease.ledgerEntries.slice(0, 6).map((e: any) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-gray-500">{formatDate(e.effectiveDate)}</TableCell>
                          <TableCell className="text-gray-500 text-xs">{e.type.replace(/_/g, ' ')}</TableCell>
                          <TableCell className="text-gray-500">{e.memo ?? '—'}</TableCell>
                          <TableCell className={e.amount >= 0 ? 'text-green-700' : 'text-red-700'}>{e.amount >= 0 ? '+' : ''}{formatCurrency(e.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
