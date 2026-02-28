'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Download, FileSpreadsheet } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'

const ENTRY_TYPES = [
  'RENT',
  'DEPOSIT',
  'LATE_FEE',
  'OTHER_INCOME',
  'MAINTENANCE_EXPENSE',
  'UTILITY',
  'OTHER_EXPENSE',
] as const

export default function AccountingExportPage() {
  const [properties, setProperties] = useState<any[]>([])
  const [propertyId, setPropertyId] = useState('')
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(ENTRY_TYPES))
  const [includeWOCosts, setIncludeWOCosts] = useState(false)
  const [preview, setPreview] = useState<any>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  useEffect(() => {
    fetch('/api/properties').then((r) => r.json()).then(setProperties)
  }, [])

  useEffect(() => {
    if (!startDate || !endDate) return
    const timer = setTimeout(() => fetchPreview(), 300)
    return () => clearTimeout(timer)
  }, [propertyId, startDate, endDate, selectedTypes, includeWOCosts])

  async function fetchPreview() {
    setLoadingPreview(true)
    const params = new URLSearchParams({
      format: 'json',
      startDate,
      endDate,
    })
    if (propertyId) params.set('propertyId', propertyId)
    if (selectedTypes.size < ENTRY_TYPES.length) {
      params.set('types', Array.from(selectedTypes).join(','))
    }
    if (includeWOCosts) params.set('includeWOCosts', 'true')

    try {
      const res = await fetch(`/api/reports/accounting-export?${params}`)
      if (res.ok) {
        setPreview(await res.json())
      } else {
        setPreview(null)
      }
    } catch {
      setPreview(null)
    }
    setLoadingPreview(false)
  }

  function buildURL(format: 'csv' | 'iif'): string {
    const params = new URLSearchParams({ format, startDate, endDate })
    if (propertyId) params.set('propertyId', propertyId)
    if (selectedTypes.size < ENTRY_TYPES.length) {
      params.set('types', Array.from(selectedTypes).join(','))
    }
    if (includeWOCosts) params.set('includeWOCosts', 'true')
    return `/api/reports/accounting-export?${params}`
  }

  function download(format: 'csv' | 'iif') {
    const a = document.createElement('a')
    a.href = buildURL(format)
    a.click()
  }

  function toggleType(type: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  function selectAll() {
    setSelectedTypes(new Set(ENTRY_TYPES))
  }

  function selectNone() {
    setSelectedTypes(new Set())
  }

  return (
    <div>
      <Link href="/dashboard/reporting" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mb-4">
        <ChevronLeft className="h-4 w-4" /> Back to Reporting
      </Link>

      <PageHeader
        title="Accounting Export"
        subtitle="Export ledger data for QuickBooks (IIF) or spreadsheet (CSV)"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Filters */}
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Filters</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Property</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                >
                  <option value="">Portfolio (all)</option>
                  {properties.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-500">Entry Types</label>
                <div className="flex gap-2 text-xs">
                  <button onClick={selectAll} className="text-blue-600 hover:underline">All</button>
                  <button onClick={selectNone} className="text-blue-600 hover:underline">None</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {ENTRY_TYPES.map((type) => (
                  <label
                    key={type}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                      selectedTypes.has(type)
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-gray-50 border-gray-200 text-gray-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={selectedTypes.has(type)}
                      onChange={() => toggleType(type)}
                    />
                    {type.replace(/_/g, ' ')}
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeWOCosts}
                onChange={(e) => setIncludeWOCosts(e.target.checked)}
                className="rounded border-gray-300"
              />
              Include Work Order Costs breakdown
            </label>
          </Card>

          {/* Download buttons */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Download</h3>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => download('csv')} disabled={!preview || preview.entryCount === 0}>
                <Download className="h-4 w-4 mr-2" /> Download CSV
              </Button>
              <Button variant="secondary" onClick={() => download('iif')} disabled={!preview || preview.entryCount === 0}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Download IIF (QuickBooks)
              </Button>
            </div>
            {preview && preview.entryCount === 0 && (
              <p className="text-sm text-gray-400 mt-3">No entries match the current filters.</p>
            )}
          </Card>
        </div>

        {/* Preview */}
        <div>
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Preview</h3>
            {loadingPreview && <p className="text-sm text-gray-400">Loading...</p>}
            {!loadingPreview && !preview && (
              <p className="text-sm text-gray-400">Set filters to see a preview.</p>
            )}
            {!loadingPreview && preview && (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Ledger Entries</span>
                  <span className="font-medium">{preview.entryCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Properties</span>
                  <span className="font-medium">{preview.propertyCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Income</span>
                  <span className="font-medium text-green-700">+{formatCurrency(preview.totalIncome)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Expense</span>
                  <span className="font-medium text-red-700">-{formatCurrency(preview.totalExpense)}</span>
                </div>
                {includeWOCosts && (
                  <>
                    <div className="border-t border-gray-100 pt-3 flex justify-between text-sm">
                      <span className="text-gray-500">WO Cost Items</span>
                      <span className="font-medium">{preview.woCostCount}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">WO Cost Total</span>
                      <span className="font-medium text-red-700">-{formatCurrency(preview.woCostTotal)}</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
