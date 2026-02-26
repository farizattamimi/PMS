'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { LeaseStatusBadge, TenantStatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'

export default function TenantsPage() {
  const [tenants, setTenants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tenants')
      .then(r => r.json())
      .then(setTenants)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <PageHeader title="Tenants" subtitle={`${tenants.length} tenants`} />

      <Card padding="none">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Email</TableHeader>
              <TableHeader>Phone</TableHeader>
              <TableHeader>Unit</TableHeader>
              <TableHeader>Lease</TableHeader>
              <TableHeader>Outstanding</TableHeader>
              <TableHeader></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableEmptyState message="Loading…" />}
            {!loading && tenants.length === 0 && <TableEmptyState message="No tenants yet" />}
            {tenants.map(t => {
              const lease = t.leases?.[0]
              const outstanding = 0 // ledger-based, calculated separately
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.user?.name}</TableCell>
                  <TableCell className="text-gray-500">{t.user?.email}</TableCell>
                  <TableCell className="text-gray-500">{t.phone}</TableCell>
                  <TableCell className="text-gray-500">
                    {lease ? `${lease.unit?.property?.name} #${lease.unit?.unitNumber}` : '—'}
                  </TableCell>
                  <TableCell>
                    {lease ? <LeaseStatusBadge status={lease.status} /> : '—'}
                  </TableCell>
                  <TableCell>
                    {outstanding > 0 ? (
                      <span className="text-red-600 font-medium">{formatCurrency(outstanding)}</span>
                    ) : (
                      <span className="text-green-600 text-sm">Current</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link href={`/dashboard/tenants/${t.id}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
