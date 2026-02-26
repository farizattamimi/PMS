'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Download } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function VacancyReportPage() {
  const [properties, setProperties] = useState<any[]>([])
  const [propertyId, setPropertyId] = useState('')
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/properties').then(r => r.json()).then(setProperties)
  }, [])

  async function runReport() {
    setLoading(true)
    const params = new URLSearchParams()
    if (propertyId) params.set('propertyId', propertyId)
    const res = await fetch(`/api/reports/vacancy?${params}`)
    setReport(await res.json())
    setLoading(false)
  }

  function downloadCSV() {
    if (!report) return
    const rows: (string | number)[][] = [
      ['Vacancy Duration Report'],
      ['Property', 'Unit', 'Beds/Baths', 'Monthly Rent', 'Vacant Since', 'Days Vacant', 'Revenue Loss'],
      ...report.vacantUnits.map((u: any) => [
        u.propertyName,
        u.unitNumber,
        `${u.bedrooms}BR/${u.bathrooms}BA`,
        u.monthlyRent,
        formatDate(u.vacancyStart),
        u.daysVacant,
        u.revenueLoss,
      ]),
      [],
      ['Summary'],
      ['Total Vacant Units', report.summary.count],
      ['Avg Days Vacant', report.summary.avgDaysVacant],
      ['Total Revenue Loss (est.)', report.summary.totalMonthlyRevenueLoss],
    ]
    const csv = rows.map(r => r.map(c => `"${c ?? ''}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `vacancy-report.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <Link href="/dashboard/reporting" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="h-4 w-4" /> Back to Reporting
      </Link>
      <PageHeader title="Vacancy Duration Report" subtitle="Units currently vacant with estimated revenue loss" />

      <div className="flex flex-wrap gap-3 mb-6">
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[220px]" value={propertyId} onChange={e => setPropertyId(e.target.value)}>
          <option value="">Portfolio (all properties)</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <Button onClick={runReport} disabled={loading}>{loading ? 'Loading…' : 'Run Report'}</Button>
        {report && report.vacantUnits?.length > 0 && (
          <Button variant="ghost" onClick={downloadCSV}><Download className="h-4 w-4 mr-2" /> CSV</Button>
        )}
      </div>

      {!report && !loading && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">Select a scope and run the report.</p>
        </div>
      )}

      {report && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card>
              <p className="text-sm text-gray-500">Vacant Units</p>
              <p className="text-2xl font-bold">{report.summary.count}</p>
            </Card>
            <Card>
              <p className="text-sm text-gray-500">Avg Days Vacant</p>
              <p className="text-2xl font-bold">{report.summary.avgDaysVacant}</p>
            </Card>
            <Card>
              <p className="text-sm text-gray-500">Est. Revenue Loss</p>
              <p className="text-2xl font-bold text-red-700">{formatCurrency(report.summary.totalMonthlyRevenueLoss)}</p>
              <p className="text-xs text-gray-400">prorated from vacancy dates</p>
            </Card>
          </div>

          <Card padding="none">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Property</TableHeader>
                  <TableHeader>Unit</TableHeader>
                  <TableHeader>Beds/Baths</TableHeader>
                  <TableHeader>Monthly Rent</TableHeader>
                  <TableHeader>Vacant Since</TableHeader>
                  <TableHeader>Days Vacant</TableHeader>
                  <TableHeader>Revenue Loss</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {report.vacantUnits.length === 0 && <TableEmptyState message="No vacant units." />}
                {report.vacantUnits.map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium text-sm">
                      <Link href={`/dashboard/properties/${u.propertyId}`} className="text-blue-600 hover:underline">{u.propertyName}</Link>
                    </TableCell>
                    <TableCell className="text-gray-700">Unit {u.unitNumber}</TableCell>
                    <TableCell className="text-gray-500 text-sm">{u.bedrooms}BR / {u.bathrooms}BA</TableCell>
                    <TableCell>{formatCurrency(u.monthlyRent)}</TableCell>
                    <TableCell className="text-gray-500 text-sm">{formatDate(u.vacancyStart)}</TableCell>
                    <TableCell>
                      <span className={`font-semibold ${u.daysVacant > 30 ? 'text-red-700' : u.daysVacant > 14 ? 'text-orange-600' : 'text-gray-700'}`}>
                        {u.daysVacant}d
                      </span>
                    </TableCell>
                    <TableCell className="text-red-700 font-medium">{formatCurrency(u.revenueLoss)}</TableCell>
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
