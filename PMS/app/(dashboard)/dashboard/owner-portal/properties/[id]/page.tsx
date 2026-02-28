'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function OwnerPropertyDetailPage() {
  const { id } = useParams()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/owner/properties/${id}`).then(r => r.json()).then(setData).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
  if (!data || data.error) return <div className="text-center py-20 text-gray-500">Property not found or not accessible.</div>

  return (
    <div>
      <Link href="/dashboard/owner-portal" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="h-4 w-4" /> Back to Portfolio
      </Link>
      <PageHeader title={data.name} subtitle={`${data.address}, ${data.city}, ${data.state}`} />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card><p className="text-sm text-gray-500">Units</p><p className="text-2xl font-bold">{data.totalUnits}</p><p className="text-xs text-gray-400">{data.occupied} occupied</p></Card>
        <Card><p className="text-sm text-gray-500">Occupancy</p><p className="text-2xl font-bold">{data.occupancy}%</p></Card>
        <Card><p className="text-sm text-gray-500">Income</p><p className="text-2xl font-bold text-green-700">{formatCurrency(data.income)}</p></Card>
        <Card><p className="text-sm text-gray-500">NOI</p><p className={`text-2xl font-bold ${data.noi >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(data.noi)}</p></Card>
      </div>

      {/* Unit summary */}
      <Card padding="none" className="mb-6">
        <div className="p-6 pb-2"><h2 className="font-semibold text-gray-900">Units</h2></div>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Unit</TableHeader>
              <TableHeader>Beds/Baths</TableHeader>
              <TableHeader>Sq Ft</TableHeader>
              <TableHeader>Rent</TableHeader>
              <TableHeader>Status</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.units.map((u: any) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.unitNumber}</TableCell>
                <TableCell className="text-gray-500">{u.bedrooms}BR / {u.bathrooms}BA</TableCell>
                <TableCell className="text-gray-500">{u.sqFt}</TableCell>
                <TableCell>{formatCurrency(u.monthlyRent)}</TableCell>
                <TableCell>
                  <Badge variant={u.status === 'OCCUPIED' ? 'success' : u.status === 'AVAILABLE' ? 'info' : 'gray'}>{u.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Distributions */}
      <Card padding="none" className="mb-6">
        <div className="p-6 pb-2"><h2 className="font-semibold text-gray-900">Distribution History</h2></div>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Period</TableHeader>
              <TableHeader>Gross Income</TableHeader>
              <TableHeader>Expenses</TableHeader>
              <TableHeader>Mgmt Fee</TableHeader>
              <TableHeader>Net Distribution</TableHeader>
              <TableHeader>Status</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.distributions.length === 0 && <TableEmptyState message="No distributions yet" />}
            {data.distributions.map((d: any) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.period}</TableCell>
                <TableCell className="text-green-700">{formatCurrency(d.grossIncome)}</TableCell>
                <TableCell className="text-red-700">({formatCurrency(d.expenses)})</TableCell>
                <TableCell className="text-gray-500">({formatCurrency(d.managementFee)})</TableCell>
                <TableCell className="font-bold text-blue-700">{formatCurrency(d.netDistribution)}</TableCell>
                <TableCell><Badge variant={d.status === 'PAID' ? 'success' : d.status === 'APPROVED' ? 'info' : 'gray'}>{d.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Recent Ledger */}
      <Card padding="none">
        <div className="p-6 pb-2"><h2 className="font-semibold text-gray-900">Recent Transactions</h2></div>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Date</TableHeader>
              <TableHeader>Type</TableHeader>
              <TableHeader>Amount</TableHeader>
              <TableHeader>Memo</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.recentLedger.length === 0 && <TableEmptyState message="No transactions" />}
            {data.recentLedger.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell className="text-gray-500">{formatDate(e.effectiveDate)}</TableCell>
                <TableCell className="text-xs text-gray-600">{e.type.replace(/_/g, ' ')}</TableCell>
                <TableCell className={e.amount >= 0 ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
                  {e.amount >= 0 ? '+' : ''}{formatCurrency(e.amount)}
                </TableCell>
                <TableCell className="text-gray-400 text-sm">{e.memo ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
