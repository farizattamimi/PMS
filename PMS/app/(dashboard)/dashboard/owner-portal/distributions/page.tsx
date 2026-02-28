'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { formatCurrency } from '@/lib/utils'

export default function OwnerDistributionsPage() {
  const [distributions, setDistributions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/owner/distributions').then(r => r.json()).then(d => setDistributions(Array.isArray(d) ? d : [])).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>

  const totalPaid = distributions.filter(d => d.status === 'PAID').reduce((s, d) => s + d.netDistribution, 0)

  return (
    <div>
      <Link href="/dashboard/owner-portal" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="h-4 w-4" /> Back to Portfolio
      </Link>
      <PageHeader title="Distribution History" subtitle={`Total paid: ${formatCurrency(totalPaid)}`} />

      <Card padding="none">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Period</TableHeader>
              <TableHeader>Property</TableHeader>
              <TableHeader>Gross Income</TableHeader>
              <TableHeader>Expenses</TableHeader>
              <TableHeader>Mgmt Fee ({'\u0025'})</TableHeader>
              <TableHeader>Net Distribution</TableHeader>
              <TableHeader>Status</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {distributions.length === 0 && <TableEmptyState message="No distributions yet" />}
            {distributions.map(d => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.period}</TableCell>
                <TableCell className="text-gray-500">{d.property?.name}</TableCell>
                <TableCell className="text-green-700">{formatCurrency(d.grossIncome)}</TableCell>
                <TableCell className="text-red-700">({formatCurrency(d.expenses)})</TableCell>
                <TableCell className="text-gray-500">{formatCurrency(d.managementFee)} ({d.managementFeePct}%)</TableCell>
                <TableCell className="font-bold text-blue-700">{formatCurrency(d.netDistribution)}</TableCell>
                <TableCell><Badge variant={d.status === 'PAID' ? 'success' : d.status === 'APPROVED' ? 'info' : 'gray'}>{d.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
