'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, BarChart2 } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

const METRICS = [
  { key: 'occupancyPct', label: 'Occupancy %', format: (v: number) => `${v}%` },
  { key: 'avgDaysToFill', label: 'Avg Days to Fill', format: (v: number) => `${v}d` },
  { key: 'avgWOResolutionHours', label: 'WO Resolution (hrs)', format: (v: number) => `${v}h` },
  { key: 'rentPerSqFt', label: 'Rent/sqft', format: (v: number) => `$${v}` },
  { key: 'maintenanceCostPerUnit', label: 'Maint Cost/Unit', format: (v: number) => formatCurrency(v) },
  { key: 'openIncidents', label: 'Open Incidents', format: (v: number) => String(v) },
]

function colorForMetric(key: string, value: number | null, avg: number | null): string {
  if (value === null || avg === null) return 'text-gray-500'
  // For occupancy and rent/sqft, higher is better
  const higherIsBetter = ['occupancyPct', 'rentPerSqFt'].includes(key)
  if (higherIsBetter) return value >= avg ? 'text-green-600' : 'text-red-600'
  // For costs, vacancy, incidents — lower is better
  return value <= avg ? 'text-green-600' : 'text-red-600'
}

export default function BenchmarksPage() {
  const [data, setData] = useState<{ properties: any[]; portfolio: any } | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeMetric, setActiveMetric] = useState('occupancyPct')

  useEffect(() => {
    fetch('/api/reports/benchmarks')
      .then(r => r.json())
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
  if (!data || !data.properties?.length) return (
    <div>
      <Link href="/dashboard/reporting" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="h-4 w-4" /> Back to Reporting
      </Link>
      <PageHeader title="Benchmarking" subtitle="Not enough data yet" />
    </div>
  )

  const { properties, portfolio } = data
  const currentMetric = METRICS.find(m => m.key === activeMetric)!
  const portfolioAvg = portfolio[activeMetric]

  const chartData = properties.map(p => ({
    name: p.propertyName.length > 16 ? p.propertyName.slice(0, 14) + '…' : p.propertyName,
    value: p[activeMetric] ?? 0,
  }))

  return (
    <div>
      <Link href="/dashboard/reporting" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="h-4 w-4" /> Back to Reporting
      </Link>
      <PageHeader title="Cross-Property Benchmarking" subtitle="Compare performance across your portfolio" />

      {/* Portfolio averages */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {METRICS.map(m => (
          <Card
            key={m.key}
            className={`text-center cursor-pointer transition-all ${activeMetric === m.key ? 'ring-2 ring-blue-500' : 'hover:bg-gray-50'}`}
            onClick={() => setActiveMetric(m.key)}
          >
            <div className="text-xs text-gray-400 mb-1">{m.label}</div>
            <div className="font-bold text-blue-700 text-base">
              {portfolio[m.key] !== null && portfolio[m.key] !== undefined
                ? m.format(portfolio[m.key])
                : '—'}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">Portfolio avg</div>
          </Card>
        ))}
      </div>

      {/* Chart */}
      <Card className="mb-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-blue-500" />
          {currentMetric.label} by Property
          {portfolioAvg !== null && (
            <span className="text-sm font-normal text-gray-400 ml-1">
              (avg: {currentMetric.format(portfolioAvg)})
            </span>
          )}
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v: number | undefined) => currentMetric.format(v ?? 0)} />
            {portfolioAvg !== null && (
              <ReferenceLine y={portfolioAvg} stroke="#3b82f6" strokeDasharray="4 4" label={{ value: 'Avg', position: 'right', fontSize: 11, fill: '#3b82f6' }} />
            )}
            <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Comparison table */}
      <Card padding="none">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Property Comparison</h3>
          <p className="text-xs text-gray-400 mt-0.5">Green = above/at portfolio avg, Red = below avg</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 px-6 py-3">Property</th>
                {METRICS.map(m => (
                  <th key={m.key} className="text-right text-xs font-semibold text-gray-500 px-4 py-3">{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Portfolio row */}
              <tr className="border-b border-gray-100 bg-blue-50/50">
                <td className="px-6 py-3 text-sm font-semibold text-blue-700">Portfolio Avg</td>
                {METRICS.map(m => (
                  <td key={m.key} className="px-4 py-3 text-right text-sm font-semibold text-blue-700">
                    {portfolio[m.key] !== null && portfolio[m.key] !== undefined ? m.format(portfolio[m.key]) : '—'}
                  </td>
                ))}
              </tr>
              {properties.map((p: any) => (
                <tr key={p.propertyId} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">{p.propertyName}</td>
                  {METRICS.map(m => {
                    const val = p[m.key]
                    const avg = portfolio[m.key]
                    const colorClass = colorForMetric(m.key, val, avg)
                    return (
                      <td key={m.key} className={`px-4 py-3 text-right text-sm font-medium ${colorClass}`}>
                        {val !== null && val !== undefined ? m.format(val) : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
