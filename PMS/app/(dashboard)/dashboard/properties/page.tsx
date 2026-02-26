'use client'

import { useEffect, useState, useRef } from 'react'
import { Plus, Building2, ChevronRight, Download, Upload, AlertTriangle, CheckCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { getOccupancyRate } from '@/lib/utils'
import Link from 'next/link'

type AddMethod = 'manual' | 'csv' | 'skip'
type UnitBatch = { buildingName: string; count: string; start: string; beds: string; baths: string; sqft: string; rent: string }
type ParsedUnit = { unitNumber: string; buildingName: string; bedrooms: number; bathrooms: number; sqFt: number; monthlyRent: number }

const PROPERTY_TYPES = ['MULTIFAMILY', 'SINGLE_FAMILY', 'COMMERCIAL', 'MIXED_USE']
const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function downloadCSVTemplate() {
  const csv = 'unitNumber,buildingName,bedrooms,bathrooms,sqFt,monthlyRent\n101,,1,1,750,1200\n102,,2,2,950,1600\n201,BuildingB,1,1,750,1200'
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'units-template.csv'; a.click()
  URL.revokeObjectURL(url)
}

function parseCSV(text: string): ParsedUnit[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s/g, ''))
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(',')
    const get = (key: string) => { const idx = headers.indexOf(key); return idx >= 0 ? (vals[idx] ?? '').trim() : '' }
    return {
      unitNumber: get('unitnumber'),
      buildingName: get('buildingname'),
      bedrooms: parseInt(get('bedrooms')) || 1,
      bathrooms: parseFloat(get('bathrooms')) || 1,
      sqFt: parseInt(get('sqft')) || 750,
      monthlyRent: parseFloat(get('monthlyrent')) || 1200,
    }
  })
}

function validateUnits(units: ParsedUnit[]): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  units.forEach((u, i) => {
    if (!u.unitNumber) errors.push(`Row ${i + 1}: missing unit number`)
    else if (seen.has(u.unitNumber)) errors.push(`Duplicate unit number: "${u.unitNumber}"`)
    else seen.add(u.unitNumber)
    if (!u.sqFt || u.sqFt <= 0) errors.push(`Unit ${u.unitNumber || i + 1}: invalid sq ft`)
    if (!u.monthlyRent || u.monthlyRent <= 0) errors.push(`Unit ${u.unitNumber || i + 1}: invalid monthly rent`)
  })
  return errors
}

export default function PropertiesPage() {
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1)
  const [step1, setStep1] = useState({ name: '', address: '', city: '', state: '', zip: '', propertyType: 'MULTIFAMILY' })
  const [addMethod, setAddMethod] = useState<AddMethod>('manual')
  const [batches, setBatches] = useState<UnitBatch[]>([{ buildingName: '', count: '10', start: '101', beds: '1', baths: '1', sqft: '750', rent: '1200' }])
  const [csvUnits, setCsvUnits] = useState<ParsedUnit[]>([])
  const [previewUnits, setPreviewUnits] = useState<ParsedUnit[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    const res = await fetch('/api/properties')
    const data = await res.json()
    setProperties(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function resetWizard() {
    setShowWizard(false)
    setWizardStep(1)
    setStep1({ name: '', address: '', city: '', state: '', zip: '', propertyType: 'MULTIFAMILY' })
    setAddMethod('manual')
    setBatches([{ buildingName: '', count: '10', start: '101', beds: '1', baths: '1', sqft: '750', rent: '1200' }])
    setCsvUnits([])
    setPreviewUnits([])
    setValidationErrors([])
  }

  function generateFromBatches(): ParsedUnit[] {
    const units: ParsedUnit[] = []
    for (const batch of batches) {
      const count = Math.min(parseInt(batch.count) || 0, 500)
      const startNum = parseInt(batch.start) || 1
      for (let i = 0; i < count; i++) {
        const num = startNum + i
        const unitNumber = batch.buildingName ? `${batch.buildingName}-${num}` : String(num)
        units.push({ unitNumber, buildingName: batch.buildingName || '', bedrooms: parseInt(batch.beds) || 1, bathrooms: parseFloat(batch.baths) || 1, sqFt: parseInt(batch.sqft) || 750, monthlyRent: parseFloat(batch.rent) || 1200 })
      }
    }
    return units
  }

  function goToStep3() {
    const units = addMethod === 'manual' ? generateFromBatches() : addMethod === 'csv' ? csvUnits : []
    const errors = addMethod !== 'skip' ? validateUnits(units) : []
    setPreviewUnits(units)
    setValidationErrors(errors)
    setWizardStep(3)
  }

  async function handleCreate() {
    setSaving(true)
    await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...step1, units: previewUnits }),
    })
    setSaving(false)
    resetWizard()
    load()
  }

  function handleCSVFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setCsvUnits(parseCSV(ev.target?.result as string))
    reader.readAsText(file)
  }

  function updateBatch(i: number, key: keyof UnitBatch, value: string) {
    setBatches(prev => prev.map((b, idx) => idx === i ? { ...b, [key]: value } : b))
  }

  const step1Valid = step1.name && step1.address && step1.city && step1.state && step1.zip

  return (
    <div>
      <PageHeader
        title="Properties"
        subtitle={`${properties.length} properties`}
        action={
          <Button onClick={() => setShowWizard(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Property
          </Button>
        }
      />

      <Card padding="none">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Address</TableHeader>
              <TableHeader>Manager</TableHeader>
              <TableHeader>Units</TableHeader>
              <TableHeader>Occupancy</TableHeader>
              <TableHeader></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableEmptyState message="Loading…" />}
            {!loading && properties.length === 0 && <TableEmptyState message="No properties yet. Add one to get started." />}
            {properties.map(p => {
              const occupied = p.units?.filter((u: any) => u.status === 'OCCUPIED').length ?? 0
              const total = p._count?.units ?? 0
              const occ = getOccupancyRate(occupied, total)
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-blue-600" />
                      </div>
                      <span className="font-medium">{p.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-500">{p.address}, {p.city}, {p.state} {p.zip}</TableCell>
                  <TableCell>{p.manager?.name}</TableCell>
                  <TableCell>{total}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5 max-w-[80px]">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${occ}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{occ}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link href={`/dashboard/properties/${p.id}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Add Property Wizard */}
      <Modal isOpen={showWizard} onClose={resetWizard} title="Add Property" size="xl">
        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-6">
          {([1, 2, 3] as const).map(s => (
            <div key={s} className="flex items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${wizardStep > s ? 'bg-blue-600 border-blue-600 text-white' : wizardStep === s ? 'border-blue-600 text-blue-600' : 'border-gray-300 text-gray-400'}`}>
                {wizardStep > s ? '✓' : s}
              </div>
              <span className={`ml-1.5 text-xs font-medium ${wizardStep === s ? 'text-gray-900' : 'text-gray-400'}`}>
                {s === 1 ? 'Property Info' : s === 2 ? 'Add Units' : 'Review'}
              </span>
              {s < 3 && <ChevronRight className="h-3 w-3 text-gray-300 mx-3" />}
            </div>
          ))}
        </div>

        {/* Step 1 */}
        {wizardStep === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property Name *</label>
              <input className={INPUT_CLS} value={step1.name} onChange={e => setStep1({ ...step1, name: e.target.value })} placeholder="Sunset Apartments" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
              <input className={INPUT_CLS} value={step1.address} onChange={e => setStep1({ ...step1, address: e.target.value })} placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                <input className={INPUT_CLS} value={step1.city} onChange={e => setStep1({ ...step1, city: e.target.value })} placeholder="Austin" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                <input className={INPUT_CLS} value={step1.state} onChange={e => setStep1({ ...step1, state: e.target.value })} placeholder="TX" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP *</label>
                <input className={INPUT_CLS} value={step1.zip} onChange={e => setStep1({ ...step1, zip: e.target.value })} placeholder="78701" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
              <select className={INPUT_CLS} value={step1.propertyType} onChange={e => setStep1({ ...step1, propertyType: e.target.value })}>
                {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={() => setWizardStep(2)} disabled={!step1Valid}>
                Next: Add Units <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2 */}
        {wizardStep === 2 && (
          <div className="space-y-4">
            {/* Method selector */}
            <div className="flex gap-1 border border-gray-200 rounded-lg p-1 w-fit">
              {(['manual', 'csv', 'skip'] as AddMethod[]).map(m => (
                <button key={m} onClick={() => setAddMethod(m)} className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${addMethod === m ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                  {m === 'manual' ? 'Manual Entry' : m === 'csv' ? 'Upload CSV' : 'Skip for now'}
                </button>
              ))}
            </div>

            {/* Manual */}
            {addMethod === 'manual' && (
              <div className="space-y-3">
                {batches.map((batch, i) => {
                  const count = parseInt(batch.count) || 0
                  const start = parseInt(batch.start) || 1
                  const preview = batch.buildingName
                    ? `${batch.buildingName}-${start} → ${batch.buildingName}-${start + count - 1}`
                    : `${start} → ${start + count - 1}`
                  return (
                    <div key={i} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-700">Building / Group {i + 1}</span>
                        {batches.length > 1 && (
                          <button onClick={() => setBatches(prev => prev.filter((_, idx) => idx !== i))} className="text-xs text-red-500 hover:underline">Remove</button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Building Name (optional)</label>
                          <input className={INPUT_CLS} placeholder="e.g. Building A" value={batch.buildingName} onChange={e => updateBatch(i, 'buildingName', e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Unit Count</label>
                          <input type="number" min="1" max="500" className={INPUT_CLS} value={batch.count} onChange={e => updateBatch(i, 'count', e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Starting Number</label>
                          <input type="number" className={INPUT_CLS} value={batch.start} onChange={e => updateBatch(i, 'start', e.target.value)} />
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Beds</label>
                          <input type="number" min="0" className={INPUT_CLS} value={batch.beds} onChange={e => updateBatch(i, 'beds', e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Baths</label>
                          <input type="number" min="1" step="0.5" className={INPUT_CLS} value={batch.baths} onChange={e => updateBatch(i, 'baths', e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Sq Ft</label>
                          <input type="number" className={INPUT_CLS} value={batch.sqft} onChange={e => updateBatch(i, 'sqft', e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Monthly Rent ($)</label>
                          <input type="number" className={INPUT_CLS} value={batch.rent} onChange={e => updateBatch(i, 'rent', e.target.value)} />
                        </div>
                      </div>
                      {count > 0 && <p className="text-xs text-blue-600">→ {count} units: {preview}</p>}
                    </div>
                  )
                })}
                <button onClick={() => setBatches(prev => [...prev, { buildingName: '', count: '10', start: '101', beds: '1', baths: '1', sqft: '750', rent: '1200' }])} className="text-sm text-blue-600 hover:underline">
                  + Add another building / group
                </button>
                <p className="text-xs text-gray-500">Total: {batches.reduce((s, b) => s + (parseInt(b.count) || 0), 0)} units</p>
              </div>
            )}

            {/* CSV */}
            {addMethod === 'csv' && (
              <div className="space-y-4">
                <button onClick={downloadCSVTemplate} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                  <Download className="h-4 w-4" /> Download CSV template
                </button>
                <div
                  className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 font-medium">Click to upload CSV</p>
                  <p className="text-xs text-gray-400 mt-1">Columns: unitNumber, buildingName, bedrooms, bathrooms, sqFt, monthlyRent</p>
                  <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVFile} />
                </div>
                {csvUnits.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg">
                    <CheckCircle className="h-4 w-4" />
                    {csvUnits.length} units parsed from CSV
                  </div>
                )}
              </div>
            )}

            {/* Skip */}
            {addMethod === 'skip' && (
              <div className="bg-gray-50 rounded-xl p-6 text-center">
                <p className="text-gray-600">No units will be created now.</p>
                <p className="text-sm text-gray-400 mt-1">You can add units from the property detail page after creation.</p>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setWizardStep(1)}>Back</Button>
              <Button onClick={goToStep3} disabled={addMethod === 'csv' && csvUnits.length === 0}>
                Next: Review <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {wizardStep === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-0.5">Property</p>
                <p className="font-semibold">{step1.name}</p>
                <p className="text-sm text-gray-500">{step1.address}, {step1.city}, {step1.state} {step1.zip}</p>
                <p className="text-xs text-gray-400 mt-1">{step1.propertyType.replace(/_/g, ' ')}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-0.5">Units to create</p>
                <p className="font-semibold text-3xl">{previewUnits.length}</p>
                {previewUnits.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    {Array.from(new Set(previewUnits.map(u => u.buildingName).filter(Boolean))).length > 0
                      ? `${Array.from(new Set(previewUnits.map(u => u.buildingName).filter(Boolean))).length} buildings`
                      : 'No buildings'}
                  </p>
                )}
              </div>
            </div>

            {validationErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-700 font-medium text-sm mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  {validationErrors.length} validation error{validationErrors.length > 1 ? 's' : ''} — fix before creating
                </div>
                {validationErrors.slice(0, 8).map((e, i) => <p key={i} className="text-xs text-red-600">• {e}</p>)}
                {validationErrors.length > 8 && <p className="text-xs text-red-400 mt-1">…and {validationErrors.length - 8} more</p>}
              </div>
            )}

            {previewUnits.length > 0 && validationErrors.length === 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Unit Preview {previewUnits.length > 20 ? `(showing first 20 of ${previewUnits.length})` : ''}
                </p>
                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Unit #</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Building</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">BR/BA</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Sq Ft</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Rent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewUnits.slice(0, 20).map((u, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-1.5 font-mono text-xs">{u.unitNumber}</td>
                          <td className="px-3 py-1.5 text-gray-500 text-xs">{u.buildingName || '—'}</td>
                          <td className="px-3 py-1.5 text-gray-500 text-xs">{u.bedrooms}BR / {u.bathrooms}BA</td>
                          <td className="px-3 py-1.5 text-gray-500 text-xs">{u.sqFt.toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-gray-500 text-xs">${u.monthlyRent.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {addMethod === 'skip' && (
              <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
                Property will be created with no units. Add units from the property detail page.
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setWizardStep(2)}>Back</Button>
              <Button onClick={handleCreate} disabled={saving || validationErrors.length > 0}>
                {saving ? 'Creating…' : `Create Property${previewUnits.length > 0 ? ` + ${previewUnits.length} Units` : ''}`}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
