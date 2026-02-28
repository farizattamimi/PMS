'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatsCard } from '@/components/ui/StatsCard'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency } from '@/lib/utils'
import { Building2, Home, TrendingUp, DollarSign, Banknote } from 'lucide-react'

export default function OwnerPortalPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/owner/portfolio').then(r => r.json()).then(setData).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>

  const { stats = {}, properties = [] } = data ?? {}

  return (
    <div>
      <PageHeader title="Owner Portal" subtitle="Portfolio overview and financial performance" />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
        <StatsCard title="Properties" value={stats.totalProperties ?? 0} icon={Building2} iconColor="text-blue-600" iconBg="bg-blue-50" />
        <StatsCard title="Total Units" value={stats.totalUnits ?? 0} icon={Home} iconColor="text-indigo-600" iconBg="bg-indigo-50" />
        <StatsCard title="Avg Occupancy" value={`${stats.avgOccupancy ?? 0}%`} icon={TrendingUp} iconColor="text-green-600" iconBg="bg-green-50" />
        <StatsCard title="YTD NOI" value={formatCurrency(stats.totalNOI ?? 0)} icon={DollarSign} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
        <StatsCard title="YTD Distributions" value={formatCurrency(stats.ytdDistributionsPaid ?? 0)} icon={Banknote} iconColor="text-purple-600" iconBg="bg-purple-50" />
      </div>

      {/* Properties table */}
      <Card padding="none" className="mb-6">
        <div className="p-6 pb-2"><h2 className="font-semibold text-gray-900">Properties</h2></div>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Property</TableHeader>
              <TableHeader>Location</TableHeader>
              <TableHeader>Units</TableHeader>
              <TableHeader>Occupancy</TableHeader>
              <TableHeader>Monthly NOI</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {properties.length === 0 && <TableEmptyState message="No properties linked to your organization" />}
            {properties.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/dashboard/owner-portal/properties/${p.id}`} className="font-medium text-blue-600 hover:underline">{p.name}</Link>
                </TableCell>
                <TableCell className="text-gray-500 text-sm">{p.city}, {p.state}</TableCell>
                <TableCell className="text-gray-600">{p.totalUnits}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-gray-200 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${p.occupancy >= 80 ? 'bg-green-500' : p.occupancy >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${p.occupancy}%` }} />
                    </div>
                    <span className="text-sm text-gray-600">{p.occupancy}%</span>
                  </div>
                </TableCell>
                <TableCell className="font-medium">{formatCurrency(p.monthlyNOI)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Recent distributions */}
      <Card padding="none">
        <div className="p-6 pb-2 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent Distributions</h2>
          <Link href="/dashboard/owner-portal/distributions" className="text-sm text-blue-600 hover:underline">View all</Link>
        </div>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Period</TableHeader>
              <TableHeader>Property</TableHeader>
              <TableHeader>Gross</TableHeader>
              <TableHeader>Expenses</TableHeader>
              <TableHeader>Mgmt Fee</TableHeader>
              <TableHeader>Net</TableHeader>
              <TableHeader>Status</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {(() => {
              const allDists = properties.flatMap((p: any) =>
                (p.recentDistributions ?? []).map((d: any) => ({ ...d, propertyName: p.name }))
              ).sort((a: any, b: any) => b.period.localeCompare(a.period)).slice(0, 10)
              if (allDists.length === 0) return <TableEmptyState message="No distributions yet" />
              return allDists.map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.period}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{d.propertyName}</TableCell>
                  <TableCell className="text-green-700">{formatCurrency(d.grossIncome)}</TableCell>
                  <TableCell className="text-red-700">({formatCurrency(d.expenses)})</TableCell>
                  <TableCell className="text-gray-500">({formatCurrency(d.managementFee)})</TableCell>
                  <TableCell className="font-bold text-blue-700">{formatCurrency(d.netDistribution)}</TableCell>
                  <TableCell>
                    <Badge variant={d.status === 'PAID' ? 'success' : d.status === 'APPROVED' ? 'info' : 'gray'}>{d.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            })()}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
