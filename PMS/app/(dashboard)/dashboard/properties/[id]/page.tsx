'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Plus, X, Upload, FileText, Trash2, ExternalLink, Wand2, PenTool, Download } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { UnitStatusBadge, LeaseStatusBadge, WorkOrderPriorityBadge, WorkOrderStatusBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { SignaturePad } from '@/components/ui/SignaturePad'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { formatCurrency, formatDate } from '@/lib/utils'

type Tab = 'overview' | 'units' | 'leases' | 'financials' | 'maintenance' | 'vendors' | 'documents' | 'assets' | 'inspections' | 'compliance'
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'units', label: 'Units' },
  { key: 'leases', label: 'Leases' },
  { key: 'financials', label: 'Financials' },
  { key: 'maintenance', label: 'Work Orders' },
  { key: 'vendors', label: 'Vendors' },
  { key: 'documents', label: 'Documents' },
  { key: 'assets', label: 'Assets' },
  { key: 'inspections', label: 'Inspections' },
  { key: 'compliance', label: 'Compliance' },
]

const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function PropertyDetailPage() {
  const { id } = useParams()
  const [property, setProperty] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')

  // Unit modal
  const [showUnitModal, setShowUnitModal] = useState(false)
  const [unitForm, setUnitForm] = useState({ unitNumber: '', bedrooms: '1', bathrooms: '1', sqFt: '', monthlyRent: '' })
  const [savingUnit, setSavingUnit] = useState(false)

  // Unit drawer
  const [drawerUnitId, setDrawerUnitId] = useState<string | null>(null)
  const [drawerUnit, setDrawerUnit] = useState<any>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)

  // Work order modal
  const [showWOModal, setShowWOModal] = useState(false)
  const [woForm, setWoForm] = useState({ title: '', description: '', category: 'GENERAL', priority: 'MEDIUM', unitId: '' })
  const [savingWO, setSavingWO] = useState(false)

  // Ledger modal
  const [showLedgerModal, setShowLedgerModal] = useState(false)
  const [ledgerForm, setLedgerForm] = useState({ type: 'RENT', amount: '', effectiveDate: new Date().toISOString().split('T')[0], memo: '' })
  const [savingLedger, setSavingLedger] = useState(false)

  // Vendors
  const [allVendors, setAllVendors] = useState<any[]>([])
  const [vendorToLink, setVendorToLink] = useState('')

  // Documents
  const [documents, setDocuments] = useState<any[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [showDocModal, setShowDocModal] = useState(false)
  const [docFile, setDocFile] = useState<File | null>(null)
  const [docScopeType, setDocScopeType] = useState('property')
  const [docScopeId, setDocScopeId] = useState(id as string)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Assets
  const [assets, setAssets] = useState<any[]>([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [showAssetModal, setShowAssetModal] = useState(false)
  // PM Schedules (shown in assets tab)
  const [pmSchedules, setPmSchedules] = useState<any[]>([])
  const [showPMModal, setShowPMModal] = useState(false)
  const [pmForm, setPmForm] = useState({ assetId: '', title: '', frequencyDays: '365', nextDueAt: '', description: '' })
  const [savingPM, setSavingPM] = useState(false)
  const [assetForm, setAssetForm] = useState({ name: '', category: 'HVAC', brand: '', modelNumber: '', serialNumber: '', installDate: '', warrantyExpiry: '', replacementCost: '', condition: 'GOOD', notes: '', unitId: '' })
  const [savingAsset, setSavingAsset] = useState(false)

  // Budgets
  const [budgets, setBudgets] = useState<any[]>([])
  const [budgetPeriod, setBudgetPeriod] = useState(new Date().toISOString().slice(0, 7))
  const [financialsSubTab, setFinancialsSubTab] = useState<'ledger' | 'budget' | 'late-fees'>('ledger')
  const [showBudgetModal, setShowBudgetModal] = useState(false)
  const [budgetForm, setBudgetForm] = useState({ category: 'RENT', budgetedAmount: '', notes: '' })
  const [savingBudget, setSavingBudget] = useState(false)

  // Late fee policy
  const [lateFeeForm, setLateFeeForm] = useState({ enabled: false, feeType: 'flat' as 'flat' | 'pct', flatAmount: '', pctValue: '', graceDays: '5' })
  const [savingLateFee, setSavingLateFee] = useState(false)
  const [lateFeeLoaded, setLateFeeLoaded] = useState(false)

  // Inspections
  const [inspections, setInspections] = useState<any[]>([])
  const [inspectionsLoading, setInspectionsLoading] = useState(false)
  const [showInspectionModal, setShowInspectionModal] = useState(false)
  const [inspectionForm, setInspectionForm] = useState({ type: 'ROUTINE', unitId: '', scheduledAt: '', notes: '' })
  const [savingInspection, setSavingInspection] = useState(false)

  // Compliance
  const [complianceItems, setComplianceItems] = useState<any[]>([])
  const [complianceLoading, setComplianceLoading] = useState(false)
  const [showComplianceModal, setShowComplianceModal] = useState(false)
  const [complianceForm, setComplianceForm] = useState({ title: '', category: 'FIRE_SAFETY', authority: '', dueDate: '', renewalDays: '', notes: '' })
  const [savingCompliance, setSavingCompliance] = useState(false)

  // Renewal offer modal
  const [renewalLeaseId, setRenewalLeaseId] = useState<string | null>(null)
  const [renewalForm, setRenewalForm] = useState({ offeredRent: '', termMonths: '12', expiryDate: '', notes: '' })
  const [savingRenewal, setSavingRenewal] = useState(false)

  // AI: lease renewal risk
  const [leaseRisks, setLeaseRisks] = useState<Record<string, { risk: string; rationale: string } | 'loading'>>({})

  // AI: rent suggestion
  const [rentSuggestions, setRentSuggestions] = useState<Record<string, { suggestion: string; delta: number | null; rationale: string } | 'loading'>>({})

  // AI: renewal letter modal
  const [renewalLetterState, setRenewalLetterState] = useState<{ leaseId: string; text: string; generating: boolean; offeredRent: string; termMonths: string } | null>(null)

  // Bulk renewal
  const [selectedLeaseIds, setSelectedLeaseIds] = useState<Set<string>>(new Set())
  const [showBulkRenewalModal, setShowBulkRenewalModal] = useState(false)
  const [bulkRenewalForm, setBulkRenewalForm] = useState({ adjustmentType: 'pct' as 'pct' | 'flat', adjustmentValue: '', termMonths: '12', expiryDays: '14', notes: '' })
  const [bulkRenewalSaving, setBulkRenewalSaving] = useState(false)
  const [bulkRenewalResult, setBulkRenewalResult] = useState<{ sent: number; skipped: number } | null>(null)

  // Lease signing + PDF
  const [signLeaseId, setSignLeaseId] = useState<string | null>(null)
  const [signingLease, setSigningLease] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null)

  // AI: cost forecast
  const [costForecast, setCostForecast] = useState('')
  const [forecastLoading, setForecastLoading] = useState(false)

  async function handleLeaseRisk(leaseId: string) {
    setLeaseRisks(prev => ({ ...prev, [leaseId]: 'loading' }))
    const res = await fetch('/api/ai/renewal-risk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leaseId }),
    })
    const data = await res.json()
    if (!data.error) setLeaseRisks(prev => ({ ...prev, [leaseId]: data }))
    else setLeaseRisks(prev => { const next = { ...prev }; delete next[leaseId]; return next })
  }

  async function handleRentSuggest(unitId: string) {
    setRentSuggestions(prev => ({ ...prev, [unitId]: 'loading' }))
    const res = await fetch('/api/ai/rent-suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unitId }),
    })
    const data = await res.json()
    if (!data.error) setRentSuggestions(prev => ({ ...prev, [unitId]: data }))
    else setRentSuggestions(prev => { const next = { ...prev }; delete next[unitId]; return next })
  }

  async function handleDraftRenewalLetter(leaseId: string, monthlyRent: number) {
    setRenewalLetterState({ leaseId, text: '', generating: true, offeredRent: String(monthlyRent), termMonths: '12' })
  }

  async function streamRenewalLetter() {
    if (!renewalLetterState) return
    setRenewalLetterState(s => s ? { ...s, generating: true, text: '' } : null)
    const res = await fetch('/api/ai/renewal-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leaseId: renewalLetterState.leaseId, offeredRent: parseFloat(renewalLetterState.offeredRent), termMonths: parseInt(renewalLetterState.termMonths) }),
    })
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      setRenewalLetterState(s => s ? { ...s, text: s.text + dec.decode(value, { stream: true }) } : null)
    }
    setRenewalLetterState(s => s ? { ...s, generating: false } : null)
  }

  async function handleCostForecast() {
    setForecastLoading(true)
    setCostForecast('')
    const res = await fetch('/api/ai/cost-forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: id }),
    })
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      setCostForecast(t => t + dec.decode(value, { stream: true }))
    }
    setForecastLoading(false)
  }

  const load = useCallback(async () => {
    const res = await fetch(`/api/properties/${id}`)
    setProperty(await res.json())
    setLoading(false)
  }, [id])

  const loadDocuments = useCallback(async () => {
    setDocsLoading(true)
    const res = await fetch(`/api/documents?propertyId=${id}`)
    setDocuments(await res.json())
    setDocsLoading(false)
  }, [id])

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true)
    const res = await fetch(`/api/assets?propertyId=${id}`)
    setAssets(await res.json())
    setAssetsLoading(false)
  }, [id])

  const loadBudgets = useCallback(async () => {
    const res = await fetch(`/api/budgets?propertyId=${id}&period=${budgetPeriod}`)
    setBudgets(await res.json())
  }, [id, budgetPeriod])

  const loadPMSchedules = useCallback(async () => {
    const res = await fetch(`/api/pm-schedules?propertyId=${id}`)
    const data = await res.json()
    setPmSchedules(Array.isArray(data) ? data : [])
  }, [id])

  const loadInspections = useCallback(async () => {
    setInspectionsLoading(true)
    const res = await fetch(`/api/inspections?propertyId=${id}`)
    setInspections(await res.json())
    setInspectionsLoading(false)
  }, [id])

  const loadCompliance = useCallback(async () => {
    setComplianceLoading(true)
    const res = await fetch(`/api/compliance?propertyId=${id}`)
    setComplianceItems(await res.json())
    setComplianceLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (property && !lateFeeLoaded) {
      setLateFeeForm({
        enabled: property.lateFeeEnabled ?? false,
        feeType: property.lateFeeFlat != null ? 'flat' : 'pct',
        flatAmount: property.lateFeeFlat != null ? String(property.lateFeeFlat) : '',
        pctValue: property.lateFeePct != null ? String(property.lateFeePct) : '',
        graceDays: String(property.gracePeriodDays ?? 5),
      })
      setLateFeeLoaded(true)
    }
  }, [property, lateFeeLoaded])
  useEffect(() => {
    if (tab === 'vendors') fetch('/api/vendors').then(r => r.json()).then(setAllVendors)
    if (tab === 'documents') loadDocuments()
    if (tab === 'assets') { loadAssets(); loadPMSchedules() }
    if (tab === 'inspections') loadInspections()
    if (tab === 'compliance') loadCompliance()
  }, [tab, loadAssets, loadCompliance, loadDocuments, loadInspections, loadPMSchedules])

  useEffect(() => {
    if (tab === 'financials' && financialsSubTab === 'budget') loadBudgets()
  }, [tab, financialsSubTab, loadBudgets])

  // Load unit drawer data
  useEffect(() => {
    if (!drawerUnitId) { setDrawerUnit(null); return }
    setDrawerLoading(true)
    fetch(`/api/units/${drawerUnitId}`)
      .then(r => r.json())
      .then(data => { setDrawerUnit(data); setDrawerLoading(false) })
  }, [drawerUnitId])

  async function handleAddUnit(e: React.FormEvent) {
    e.preventDefault(); setSavingUnit(true)
    await fetch('/api/units', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: id, ...unitForm, bedrooms: parseInt(unitForm.bedrooms), bathrooms: parseFloat(unitForm.bathrooms), sqFt: parseInt(unitForm.sqFt), monthlyRent: parseFloat(unitForm.monthlyRent) }) })
    setSavingUnit(false); setShowUnitModal(false); setUnitForm({ unitNumber: '', bedrooms: '1', bathrooms: '1', sqFt: '', monthlyRent: '' }); load()
  }

  async function handleAddWO(e: React.FormEvent) {
    e.preventDefault(); setSavingWO(true)
    await fetch('/api/workorders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: id, ...woForm, unitId: woForm.unitId || undefined }) })
    setSavingWO(false); setShowWOModal(false); setWoForm({ title: '', description: '', category: 'GENERAL', priority: 'MEDIUM', unitId: '' }); load()
  }

  async function handleAddLedger(e: React.FormEvent) {
    e.preventDefault(); setSavingLedger(true)
    await fetch('/api/ledger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: id, ...ledgerForm, amount: parseFloat(ledgerForm.amount) }) })
    setSavingLedger(false); setShowLedgerModal(false); load()
  }

  async function handleLinkVendor() {
    if (!vendorToLink) return
    await fetch(`/api/properties/${id}/vendors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vendorId: vendorToLink }) })
    setVendorToLink(''); load()
  }

  async function handleUnlinkVendor(vendorId: string) {
    await fetch(`/api/properties/${id}/vendors/${vendorId}`, { method: 'DELETE' }); load()
  }

  async function advanceWOStatus(woId: string, currentStatus: string) {
    const next: Record<string, string> = { NEW: 'ASSIGNED', ASSIGNED: 'IN_PROGRESS', IN_PROGRESS: 'COMPLETED', BLOCKED: 'IN_PROGRESS' }
    const nextStatus = next[currentStatus]; if (!nextStatus) return
    await fetch(`/api/workorders/${woId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus }) }); load()
  }

  async function activateLease(leaseId: string) {
    await fetch(`/api/leases/${leaseId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'ACTIVE' }) }); load()
  }

  async function handleSignLease(dataUrl: string) {
    if (!signLeaseId) return
    setSigningLease(true)
    await fetch(`/api/leases/${signLeaseId}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature: dataUrl }),
    })
    setSigningLease(false)
    setSignLeaseId(null)
    load()
  }

  async function handleGeneratePdf(leaseId: string) {
    setGeneratingPdf(leaseId)
    const res = await fetch(`/api/leases/${leaseId}/pdf`, { method: 'POST' })
    const data = await res.json()
    if (data.fileUrl) window.open(data.fileUrl, '_blank')
    setGeneratingPdf(null)
  }

  async function setUnitStatus(unitId: string, status: string) {
    await fetch(`/api/units/${unitId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); load()
  }

  async function handleAddAsset(e: React.FormEvent) {
    e.preventDefault(); setSavingAsset(true)
    await fetch('/api/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: id, ...assetForm, unitId: assetForm.unitId || undefined, replacementCost: assetForm.replacementCost ? parseFloat(assetForm.replacementCost) : undefined }) })
    setSavingAsset(false); setShowAssetModal(false); setAssetForm({ name: '', category: 'HVAC', brand: '', modelNumber: '', serialNumber: '', installDate: '', warrantyExpiry: '', replacementCost: '', condition: 'GOOD', notes: '', unitId: '' }); loadAssets()
  }

  async function handleDeleteAsset(assetId: string) {
    if (!confirm('Delete this asset?')) return
    await fetch(`/api/assets/${assetId}`, { method: 'DELETE' }); loadAssets()
  }

  async function handleAddBudget(e: React.FormEvent) {
    e.preventDefault(); setSavingBudget(true)
    await fetch('/api/budgets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: id, period: budgetPeriod, ...budgetForm, budgetedAmount: parseFloat(budgetForm.budgetedAmount) }) })
    setSavingBudget(false); setShowBudgetModal(false); setBudgetForm({ category: 'RENT', budgetedAmount: '', notes: '' }); loadBudgets()
  }

  async function handleDeleteBudget(budgetId: string) {
    await fetch(`/api/budgets/${budgetId}`, { method: 'DELETE' }); loadBudgets()
  }

  async function handleSaveLateFee(e: React.FormEvent) {
    e.preventDefault(); setSavingLateFee(true)
    const body: Record<string, unknown> = {
      lateFeeEnabled: lateFeeForm.enabled,
      gracePeriodDays: parseInt(lateFeeForm.graceDays) || 5,
      lateFeeFlat: lateFeeForm.feeType === 'flat' && lateFeeForm.flatAmount ? parseFloat(lateFeeForm.flatAmount) : null,
      lateFeePct: lateFeeForm.feeType === 'pct' && lateFeeForm.pctValue ? parseFloat(lateFeeForm.pctValue) : null,
    }
    await fetch(`/api/properties/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSavingLateFee(false); load()
  }

  async function handleAddPM(e: React.FormEvent) {
    e.preventDefault(); setSavingPM(true)
    await fetch('/api/pm-schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...pmForm, frequencyDays: Number(pmForm.frequencyDays) }) })
    setSavingPM(false); setShowPMModal(false); setPmForm({ assetId: '', title: '', frequencyDays: '365', nextDueAt: '', description: '' }); loadPMSchedules()
  }

  async function handleDeletePM(pmId: string) {
    await fetch(`/api/pm-schedules/${pmId}`, { method: 'DELETE' }); loadPMSchedules()
  }

  async function handleAddInspection(e: React.FormEvent) {
    e.preventDefault(); setSavingInspection(true)
    await fetch('/api/inspections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: id, ...inspectionForm, unitId: inspectionForm.unitId || undefined }) })
    setSavingInspection(false); setShowInspectionModal(false); setInspectionForm({ type: 'ROUTINE', unitId: '', scheduledAt: '', notes: '' }); loadInspections()
  }

  async function handleAddCompliance(e: React.FormEvent) {
    e.preventDefault(); setSavingCompliance(true)
    await fetch('/api/compliance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: id, ...complianceForm, renewalDays: complianceForm.renewalDays ? Number(complianceForm.renewalDays) : undefined }) })
    setSavingCompliance(false); setShowComplianceModal(false); setComplianceForm({ title: '', category: 'FIRE_SAFETY', authority: '', dueDate: '', renewalDays: '', notes: '' }); loadCompliance()
  }

  async function handleMarkCompliant(itemId: string) {
    await fetch(`/api/compliance/${itemId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'COMPLIANT' }) }); loadCompliance()
  }

  async function handleDeleteCompliance(itemId: string) {
    if (!confirm('Delete this compliance item?')) return
    await fetch(`/api/compliance/${itemId}`, { method: 'DELETE' }); loadCompliance()
  }

  async function handleSendRenewalOffer(e: React.FormEvent) {
    e.preventDefault(); setSavingRenewal(true)
    await fetch(`/api/leases/${renewalLeaseId}/renewal-offer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...renewalForm, offeredRent: parseFloat(renewalForm.offeredRent), termMonths: parseInt(renewalForm.termMonths) }) })
    setSavingRenewal(false); setRenewalLeaseId(null); setRenewalForm({ offeredRent: '', termMonths: '12', expiryDate: '', notes: '' })
  }

  function toggleLeaseSelection(leaseId: string) {
    setSelectedLeaseIds(prev => {
      const next = new Set(prev)
      if (next.has(leaseId)) next.delete(leaseId)
      else next.add(leaseId)
      return next
    })
  }

  function toggleAllActiveLeases() {
    const activeIds = leases.filter((l: any) => l.status === 'ACTIVE').map((l: any) => l.id)
    const allSelected = activeIds.every((id: string) => selectedLeaseIds.has(id))
    if (allSelected) setSelectedLeaseIds(new Set())
    else setSelectedLeaseIds(new Set(activeIds))
  }

  async function handleBulkRenewal(e: React.FormEvent) {
    e.preventDefault()
    setBulkRenewalSaving(true)
    setBulkRenewalResult(null)
    const res = await fetch('/api/leases/bulk-renewal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leaseIds: Array.from(selectedLeaseIds),
        rentAdjustmentType: bulkRenewalForm.adjustmentType,
        rentAdjustmentValue: parseFloat(bulkRenewalForm.adjustmentValue) || 0,
        termMonths: parseInt(bulkRenewalForm.termMonths) || 12,
        expiryDays: parseInt(bulkRenewalForm.expiryDays) || 14,
        notes: bulkRenewalForm.notes || undefined,
      }),
    })
    const data = await res.json()
    setBulkRenewalSaving(false)
    setBulkRenewalResult({ sent: data.sent ?? 0, skipped: data.skipped ?? 0 })
    setSelectedLeaseIds(new Set())
    setShowBulkRenewalModal(false)
    load()
  }

  async function handleUploadDoc(e: React.FormEvent) {
    e.preventDefault()
    if (!docFile) return
    setUploadingDoc(true)
    const fd = new FormData()
    fd.append('file', docFile)
    fd.append('scopeType', docScopeType)
    fd.append('scopeId', docScopeId)
    fd.append('propertyId', id as string)
    await fetch('/api/documents', { method: 'POST', body: fd })
    setUploadingDoc(false)
    setShowDocModal(false)
    setDocFile(null)
    setDocScopeType('property')
    setDocScopeId(id as string)
    loadDocuments()
  }

  async function handleDeleteDoc(docId: string) {
    await fetch(`/api/documents/${docId}`, { method: 'DELETE' })
    loadDocuments()
  }

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
  if (!property || property.error) return <div className="text-center py-20 text-gray-500">Property not found.</div>

  const units: any[] = property.units ?? []
  const leases: any[] = property.leases ?? []
  const ledger: any[] = property.ledgerEntries ?? []
  const workOrders: any[] = property.workOrders ?? []
  const vendors: any[] = (property.propertyVendors ?? []).map((pv: any) => pv.vendor)
  const occupied = units.filter(u => u.status === 'OCCUPIED').length
  const occupancyRate = units.length > 0 ? Math.round((occupied / units.length) * 100) : 0
  const openWOs = workOrders.filter(w => !['COMPLETED', 'CANCELED'].includes(w.status)).length
  const income = ledger.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0)
  const expenses = ledger.filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)
  const now = new Date()
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const expiringLeases = leases.filter(l => l.status === 'ACTIVE' && new Date(l.endDate) <= in30 && new Date(l.endDate) >= now).length
  const linkedVendorIds = new Set(vendors.map((v: any) => v.id))
  const unlinkableVendors = allVendors.filter(v => !linkedVendorIds.has(v.id))

  return (
    <div className="relative">
      <Link href="/dashboard/properties" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="h-4 w-4" /> Back to Properties
      </Link>
      <PageHeader title={property.name} subtitle={`${property.address}, ${property.city}, ${property.state} ${property.zip}`} />

      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t.label}</button>
          ))}
        </nav>
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card><p className="text-sm text-gray-500 mb-1">Occupancy</p><p className="text-2xl font-bold">{occupancyRate}%</p><p className="text-xs text-gray-400">{occupied}/{units.length} units</p></Card>
          <Card><p className="text-sm text-gray-500 mb-1">Open Work Orders</p><p className="text-2xl font-bold">{openWOs}</p></Card>
          <Card><p className="text-sm text-gray-500 mb-1">Expiring Leases</p><p className="text-2xl font-bold">{expiringLeases}</p><p className="text-xs text-gray-400">Next 30 days</p></Card>
          <Card><p className="text-sm text-gray-500 mb-1">NOI</p><p className="text-2xl font-bold">{formatCurrency(income - expenses)}</p></Card>
          <Card className="col-span-2"><p className="text-sm text-gray-500 mb-1">Manager</p><p className="font-medium">{property.manager?.name}</p><p className="text-sm text-gray-400">{property.manager?.email}</p></Card>
          <Card className="col-span-2"><p className="text-sm text-gray-500 mb-1">Property Type</p><p className="font-medium">{property.propertyType?.replace('_', ' ')}</p><p className="text-sm text-gray-400">Status: {property.status}</p></Card>
        </div>
      )}

      {/* ── Units ── */}
      {tab === 'units' && (
        <>
          <div className="flex justify-end mb-4"><Button onClick={() => setShowUnitModal(true)}><Plus className="h-4 w-4 mr-2" /> Add Unit</Button></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {units.map(unit => {
              const activeLease = unit.leases?.[0]
              return (
                <div key={unit.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <button onClick={() => setDrawerUnitId(unit.id)} className="font-semibold text-gray-900 hover:text-blue-600 text-left">Unit {unit.unitNumber}</button>
                      <p className="text-xs text-gray-500">{unit.bedrooms}BR / {unit.bathrooms}BA · {unit.sqFt} sq ft</p>
                    </div>
                    <UnitStatusBadge status={unit.status} />
                  </div>
                  <p className="text-lg font-bold text-gray-900">{formatCurrency(unit.monthlyRent)}<span className="text-sm font-normal text-gray-400">/mo</span></p>
                  {activeLease && <p className="text-xs text-gray-500 mt-1 truncate">{activeLease.tenant?.user?.name}</p>}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {unit.status === 'AVAILABLE' && <button onClick={() => setUnitStatus(unit.id, 'DOWN')} className="text-xs text-red-600 hover:underline">Mark Down</button>}
                    {unit.status === 'DOWN' && <button onClick={() => setUnitStatus(unit.id, 'AVAILABLE')} className="text-xs text-green-600 hover:underline">Mark Available</button>}
                    {unit.status === 'AVAILABLE' && <button onClick={() => setUnitStatus(unit.id, 'MODEL')} className="text-xs text-purple-600 hover:underline">Mark Model</button>}
                    <button onClick={() => setDrawerUnitId(unit.id)} className="text-xs text-blue-600 hover:underline ml-auto">Details →</button>
                  </div>
                </div>
              )
            })}
            {units.length === 0 && <p className="text-gray-500 col-span-full text-center py-8">No units yet.</p>}
          </div>
          <Modal isOpen={showUnitModal} onClose={() => setShowUnitModal(false)} title="Add Unit">
            <form onSubmit={handleAddUnit} className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Unit Number</label><input className={INPUT_CLS} value={unitForm.unitNumber} onChange={e => setUnitForm({ ...unitForm, unitNumber: e.target.value })} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms</label><input type="number" min="0" className={INPUT_CLS} value={unitForm.bedrooms} onChange={e => setUnitForm({ ...unitForm, bedrooms: e.target.value })} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Bathrooms</label><input type="number" min="1" step="0.5" className={INPUT_CLS} value={unitForm.bathrooms} onChange={e => setUnitForm({ ...unitForm, bathrooms: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Sq Ft</label><input type="number" className={INPUT_CLS} value={unitForm.sqFt} onChange={e => setUnitForm({ ...unitForm, sqFt: e.target.value })} required /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Monthly Rent</label><input type="number" className={INPUT_CLS} value={unitForm.monthlyRent} onChange={e => setUnitForm({ ...unitForm, monthlyRent: e.target.value })} required /></div>
              </div>
              <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowUnitModal(false)}>Cancel</Button><Button type="submit" disabled={savingUnit}>{savingUnit ? 'Saving…' : 'Add Unit'}</Button></div>
            </form>
          </Modal>
        </>
      )}

      {/* ── Leases ── */}
      {tab === 'leases' && (
        <>
        {bulkRenewalResult && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm font-medium bg-green-50 text-green-800 border border-green-200">
            Bulk renewal complete: {bulkRenewalResult.sent} offer{bulkRenewalResult.sent !== 1 ? 's' : ''} sent{bulkRenewalResult.skipped > 0 ? `, ${bulkRenewalResult.skipped} skipped` : ''}.
          </div>
        )}
        {selectedLeaseIds.size > 0 && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-purple-50 border border-purple-200 rounded-lg">
            <span className="text-sm font-medium text-purple-800">{selectedLeaseIds.size} lease{selectedLeaseIds.size !== 1 ? 's' : ''} selected</span>
            <button onClick={() => setShowBulkRenewalModal(true)} className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors">Bulk Renew</button>
            <button onClick={() => setSelectedLeaseIds(new Set())} className="text-sm text-purple-600 hover:underline">Clear</button>
          </div>
        )}
        <Card padding="none">
          <Table>
            <TableHead><TableRow><TableHeader><input type="checkbox" checked={leases.filter((l: any) => l.status === 'ACTIVE').length > 0 && leases.filter((l: any) => l.status === 'ACTIVE').every((l: any) => selectedLeaseIds.has(l.id))} onChange={toggleAllActiveLeases} className="rounded border-gray-300" /></TableHeader><TableHeader>Tenant</TableHeader><TableHeader>Unit</TableHeader><TableHeader>Start</TableHeader><TableHeader>End</TableHeader><TableHeader>Rent</TableHeader><TableHeader>Status</TableHeader><TableHeader>AI Risk</TableHeader><TableHeader></TableHeader></TableRow></TableHead>
            <TableBody>
              {leases.length === 0 && <TableEmptyState message="No leases yet" />}
              {leases.map(l => {
                const risk = leaseRisks[l.id]
                const rentSug = l.unitId ? rentSuggestions[l.unitId] : undefined
                return (
                  <TableRow key={l.id}>
                    <TableCell>{l.status === 'ACTIVE' ? <input type="checkbox" checked={selectedLeaseIds.has(l.id)} onChange={() => toggleLeaseSelection(l.id)} className="rounded border-gray-300" /> : null}</TableCell>
                    <TableCell className="font-medium">{l.tenant?.user?.name}</TableCell>
                    <TableCell className="text-gray-500">Unit {l.unit?.unitNumber}</TableCell>
                    <TableCell className="text-gray-500">{formatDate(l.startDate)}</TableCell>
                    <TableCell className="text-gray-500">{formatDate(l.endDate)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {formatCurrency(l.monthlyRent)}
                        {l.status === 'ACTIVE' && l.unitId && (
                          rentSug === 'loading'
                            ? <span className="text-xs text-gray-400 animate-pulse">…</span>
                            : rentSug
                              ? <span title={rentSug.rationale} className={`text-xs font-medium px-1.5 py-0.5 rounded cursor-help ${rentSug.suggestion === 'RAISE' ? 'bg-green-50 text-green-700' : rentSug.suggestion === 'REDUCE' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                  {rentSug.suggestion}{rentSug.delta ? ` $${Math.abs(rentSug.delta)}` : ''}
                                </span>
                              : <button onClick={() => handleRentSuggest(l.unitId)} className="text-xs text-teal-600 hover:underline font-medium">Rent?</button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell><LeaseStatusBadge status={l.status} /></TableCell>
                    <TableCell>
                      {l.status === 'ACTIVE' ? (
                        risk === 'loading'
                          ? <span className="text-xs text-gray-400 animate-pulse">…</span>
                          : risk
                            ? <span title={(risk as any).rationale} className={`text-xs font-medium px-1.5 py-0.5 rounded cursor-help ${(risk as any).risk === 'LOW' ? 'bg-green-50 text-green-700' : (risk as any).risk === 'HIGH' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>{(risk as any).risk}</span>
                            : <button onClick={() => handleLeaseRisk(l.id)} className="text-xs text-indigo-600 hover:underline font-medium">Assess</button>
                      ) : <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 flex-wrap">
                        {l.status === 'DRAFT' && <button onClick={() => activateLease(l.id)} className="text-xs text-blue-600 hover:underline font-medium">Activate</button>}
                        {l.status === 'ACTIVE' && <button onClick={() => { setRenewalLeaseId(l.id); setRenewalForm({ offeredRent: String(l.monthlyRent), termMonths: '12', expiryDate: '', notes: '' }) }} className="text-xs text-purple-600 hover:underline font-medium">Renewal Offer</button>}
                        {l.status === 'ACTIVE' && <button onClick={() => handleDraftRenewalLetter(l.id, l.monthlyRent)} className="text-xs text-indigo-600 hover:underline font-medium flex items-center gap-0.5"><Wand2 className="h-2.5 w-2.5" />Draft Letter</button>}
                        {!l.managerSignature ? (
                          <button onClick={() => setSignLeaseId(l.id)} className="text-xs text-emerald-600 hover:underline font-medium flex items-center gap-0.5"><PenTool className="h-2.5 w-2.5" />Sign</button>
                        ) : (
                          <span className="text-xs text-emerald-600 font-medium flex items-center gap-0.5"><PenTool className="h-2.5 w-2.5" />Signed</span>
                        )}
                        <button onClick={() => handleGeneratePdf(l.id)} disabled={generatingPdf === l.id} className="text-xs text-gray-600 hover:underline font-medium flex items-center gap-0.5 disabled:opacity-50"><Download className="h-2.5 w-2.5" />{generatingPdf === l.id ? 'Generating…' : 'PDF'}</button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
        <Modal isOpen={!!signLeaseId} onClose={() => setSignLeaseId(null)} title="Sign Lease">
          <SignaturePad
            label="Draw your signature below to sign this lease as manager"
            onSave={handleSignLease}
            onCancel={() => setSignLeaseId(null)}
          />
          {signingLease && <p className="text-sm text-gray-400 mt-2 animate-pulse">Saving signature…</p>}
        </Modal>
        {/* Bulk renewal modal */}
        {showBulkRenewalModal && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Bulk Lease Renewal — {selectedLeaseIds.size} lease{selectedLeaseIds.size !== 1 ? 's' : ''}</h3>
                <button onClick={() => setShowBulkRenewalModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
              </div>
              <form onSubmit={handleBulkRenewal} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rent Adjustment</label>
                  <div className="flex gap-2">
                    <select className={INPUT_CLS + ' w-24'} value={bulkRenewalForm.adjustmentType} onChange={e => setBulkRenewalForm(f => ({ ...f, adjustmentType: e.target.value as 'pct' | 'flat' }))}>
                      <option value="pct">%</option>
                      <option value="flat">$ Flat</option>
                    </select>
                    <input className={INPUT_CLS} type="number" step="0.01" placeholder={bulkRenewalForm.adjustmentType === 'pct' ? 'e.g. 3 for 3%' : 'e.g. 50'} value={bulkRenewalForm.adjustmentValue} onChange={e => setBulkRenewalForm(f => ({ ...f, adjustmentValue: e.target.value }))} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">New Term (months)</label><input className={INPUT_CLS} type="number" min="1" value={bulkRenewalForm.termMonths} onChange={e => setBulkRenewalForm(f => ({ ...f, termMonths: e.target.value }))} required /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Offer Expires In (days)</label><input className={INPUT_CLS} type="number" min="1" value={bulkRenewalForm.expiryDays} onChange={e => setBulkRenewalForm(f => ({ ...f, expiryDays: e.target.value }))} required /></div>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label><textarea className={INPUT_CLS} rows={2} value={bulkRenewalForm.notes} onChange={e => setBulkRenewalForm(f => ({ ...f, notes: e.target.value }))} /></div>

                {/* Preview */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Preview</p>
                  <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50"><tr><th className="px-3 py-1.5 text-left">Tenant</th><th className="px-3 py-1.5 text-left">Unit</th><th className="px-3 py-1.5 text-right">Current</th><th className="px-3 py-1.5 text-right">New Rent</th></tr></thead>
                      <tbody>
                        {leases.filter((l: any) => selectedLeaseIds.has(l.id)).map((l: any) => {
                          const adj = parseFloat(bulkRenewalForm.adjustmentValue) || 0
                          const newRent = bulkRenewalForm.adjustmentType === 'pct'
                            ? Math.round(l.monthlyRent * (1 + adj / 100) * 100) / 100
                            : Math.round((l.monthlyRent + adj) * 100) / 100
                          return (
                            <tr key={l.id} className="border-t border-gray-100">
                              <td className="px-3 py-1.5">{l.tenant?.user?.name}</td>
                              <td className="px-3 py-1.5">{l.unit?.unitNumber}</td>
                              <td className="px-3 py-1.5 text-right">{formatCurrency(l.monthlyRent)}</td>
                              <td className="px-3 py-1.5 text-right font-medium text-purple-700">{formatCurrency(newRent)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setShowBulkRenewalModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                  <button type="submit" disabled={bulkRenewalSaving} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors">{bulkRenewalSaving ? 'Sending…' : `Send ${selectedLeaseIds.size} Offer${selectedLeaseIds.size !== 1 ? 's' : ''}`}</button>
                </div>
              </form>
            </div>
          </div>
        )}
        </>
      )}

      {/* ── Financials ── */}
      {tab === 'financials' && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card><p className="text-sm text-gray-500">Total Income</p><p className="text-xl font-bold text-green-700">+{formatCurrency(income)}</p></Card>
            <Card><p className="text-sm text-gray-500">Total Expenses</p><p className="text-xl font-bold text-red-700">-{formatCurrency(expenses)}</p></Card>
            <Card><p className="text-sm text-gray-500">NOI</p><p className={`text-xl font-bold ${income - expenses >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(income - expenses)}</p></Card>
          </div>

          {/* AI Cost Forecast */}
          <Card className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-indigo-500" /> AI Cost Forecast
              </h3>
              <button
                onClick={handleCostForecast}
                disabled={forecastLoading}
                className="text-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg px-3 py-1.5 font-medium transition-colors disabled:opacity-50"
              >
                {forecastLoading ? 'Generating…' : 'Generate Forecast'}
              </button>
            </div>
            {!costForecast && !forecastLoading && (
              <p className="text-xs text-gray-400">AI estimate of next 3-month maintenance spend based on assets, PM schedules, and cost history.</p>
            )}
            {forecastLoading && !costForecast && (
              <p className="text-sm text-gray-400"><span className="animate-pulse">…</span></p>
            )}
            {costForecast && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {costForecast}
                {forecastLoading && <span className="animate-pulse">…</span>}
              </p>
            )}
          </Card>

          {/* Sub-tabs */}
          <div className="flex gap-4 border-b border-gray-200 mb-4">
            {(['ledger', 'budget', 'late-fees'] as const).map(t => (
              <button key={t} onClick={() => setFinancialsSubTab(t)} className={`pb-2 text-sm font-medium border-b-2 transition-colors capitalize ${financialsSubTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t === 'ledger' ? 'Ledger Entries' : t === 'budget' ? 'Budget' : 'Late Fee Policy'}</button>
            ))}
          </div>
          {financialsSubTab === 'ledger' && <div className="flex justify-end mb-4"><Button onClick={() => setShowLedgerModal(true)}><Plus className="h-4 w-4 mr-2" /> Add Entry</Button></div>}
          {financialsSubTab === 'budget' && (
            <div className="mb-4 flex items-center gap-3">
              <input type="month" className={INPUT_CLS + ' max-w-[180px]'} value={budgetPeriod} onChange={e => setBudgetPeriod(e.target.value)} />
              <Button onClick={() => setShowBudgetModal(true)}><Plus className="h-4 w-4 mr-2" /> Add Budget Line</Button>
            </div>
          )}
          {financialsSubTab === 'ledger' && (
            <Card padding="none">
              <Table>
                <TableHead><TableRow><TableHeader>Date</TableHeader><TableHeader>Type</TableHeader><TableHeader>Memo</TableHeader><TableHeader>Amount</TableHeader></TableRow></TableHead>
                <TableBody>
                  {ledger.length === 0 && <TableEmptyState message="No ledger entries yet" />}
                  {ledger.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="text-gray-500">{formatDate(e.effectiveDate)}</TableCell>
                      <TableCell className="text-gray-600 text-xs">{e.type.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-gray-500 text-sm">{e.memo ?? '—'}</TableCell>
                      <TableCell className={e.amount >= 0 ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>{e.amount >= 0 ? '+' : ''}{formatCurrency(e.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {financialsSubTab === 'budget' && (
            <Card padding="none">
              <Table>
                <TableHead><TableRow><TableHeader>Category</TableHeader><TableHeader>Budgeted</TableHeader><TableHeader>Actual</TableHeader><TableHeader>Variance</TableHeader><TableHeader></TableHeader></TableRow></TableHead>
                <TableBody>
                  {budgets.length === 0 && <TableEmptyState message="No budget lines for this period. Add one above." />}
                  {budgets.map(b => {
                    const actual = ledger.filter(e => e.type === b.category).reduce((s: number, e: any) => s + e.amount, 0)
                    const variance = b.budgetedAmount - Math.abs(actual)
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium text-sm">{b.category.replace(/_/g, ' ')}</TableCell>
                        <TableCell>{formatCurrency(b.budgetedAmount)}</TableCell>
                        <TableCell className={actual < 0 ? 'text-red-700' : 'text-green-700'}>{formatCurrency(Math.abs(actual))}</TableCell>
                        <TableCell className={variance >= 0 ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>{variance >= 0 ? '+' : ''}{formatCurrency(variance)}</TableCell>
                        <TableCell><button onClick={() => handleDeleteBudget(b.id)} className="text-xs text-red-400 hover:text-red-600 hover:underline">Delete</button></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Card>
          )}

          {financialsSubTab === 'late-fees' && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">Late Fee Policy</h3>
              <form onSubmit={handleSaveLateFee} className="space-y-4 max-w-md">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={lateFeeForm.enabled} onChange={e => setLateFeeForm({ ...lateFeeForm, enabled: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm font-medium text-gray-700">Enable automatic late fee assessment</span>
                </label>
                {lateFeeForm.enabled && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Fee Type</label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="feeType" value="flat" checked={lateFeeForm.feeType === 'flat'} onChange={() => setLateFeeForm({ ...lateFeeForm, feeType: 'flat' })} className="text-blue-600 focus:ring-blue-500" />
                          <span className="text-sm text-gray-700">Flat amount</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="feeType" value="pct" checked={lateFeeForm.feeType === 'pct'} onChange={() => setLateFeeForm({ ...lateFeeForm, feeType: 'pct' })} className="text-blue-600 focus:ring-blue-500" />
                          <span className="text-sm text-gray-700">Percentage of rent</span>
                        </label>
                      </div>
                    </div>
                    {lateFeeForm.feeType === 'flat' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Flat Fee Amount ($)</label>
                        <input type="number" step="0.01" min="0" className={INPUT_CLS} value={lateFeeForm.flatAmount} onChange={e => setLateFeeForm({ ...lateFeeForm, flatAmount: e.target.value })} placeholder="50.00" required />
                      </div>
                    )}
                    {lateFeeForm.feeType === 'pct' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Percentage of Monthly Rent (%)</label>
                        <input type="number" step="0.1" min="0" max="100" className={INPUT_CLS} value={lateFeeForm.pctValue} onChange={e => setLateFeeForm({ ...lateFeeForm, pctValue: e.target.value })} placeholder="5.0" required />
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Grace Period (days after 1st)</label>
                      <input type="number" min="0" max="28" className={INPUT_CLS} value={lateFeeForm.graceDays} onChange={e => setLateFeeForm({ ...lateFeeForm, graceDays: e.target.value })} required />
                      <p className="text-xs text-gray-400 mt-1">Late fees will be assessed after this many days past the 1st of each month.</p>
                    </div>
                  </>
                )}
                <Button type="submit" disabled={savingLateFee}>{savingLateFee ? 'Saving…' : 'Save Late Fee Policy'}</Button>
              </form>
            </Card>
          )}

          <Modal isOpen={showLedgerModal} onClose={() => setShowLedgerModal(false)} title="Add Ledger Entry">
            <form onSubmit={handleAddLedger} className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label><select className={INPUT_CLS} value={ledgerForm.type} onChange={e => setLedgerForm({ ...ledgerForm, type: e.target.value })}>{['RENT', 'DEPOSIT', 'LATE_FEE', 'MAINTENANCE_EXPENSE', 'UTILITY', 'OTHER_INCOME', 'OTHER_EXPENSE'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Amount (negative for expense)</label><input type="number" step="0.01" className={INPUT_CLS} value={ledgerForm.amount} onChange={e => setLedgerForm({ ...ledgerForm, amount: e.target.value })} required /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Effective Date</label><input type="date" className={INPUT_CLS} value={ledgerForm.effectiveDate} onChange={e => setLedgerForm({ ...ledgerForm, effectiveDate: e.target.value })} required /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Memo</label><input className={INPUT_CLS} value={ledgerForm.memo} onChange={e => setLedgerForm({ ...ledgerForm, memo: e.target.value })} /></div>
              <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowLedgerModal(false)}>Cancel</Button><Button type="submit" disabled={savingLedger}>{savingLedger ? 'Saving…' : 'Add Entry'}</Button></div>
            </form>
          </Modal>

          <Modal isOpen={showBudgetModal} onClose={() => setShowBudgetModal(false)} title="Add Budget Line">
            <form onSubmit={handleAddBudget} className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Category</label><select className={INPUT_CLS} value={budgetForm.category} onChange={e => setBudgetForm({ ...budgetForm, category: e.target.value })}>{['RENT', 'DEPOSIT', 'LATE_FEE', 'MAINTENANCE_EXPENSE', 'UTILITY', 'OTHER_INCOME', 'OTHER_EXPENSE'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Budgeted Amount</label><input type="number" step="0.01" className={INPUT_CLS} value={budgetForm.budgetedAmount} onChange={e => setBudgetForm({ ...budgetForm, budgetedAmount: e.target.value })} required /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label><input className={INPUT_CLS} value={budgetForm.notes} onChange={e => setBudgetForm({ ...budgetForm, notes: e.target.value })} /></div>
              <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowBudgetModal(false)}>Cancel</Button><Button type="submit" disabled={savingBudget}>{savingBudget ? 'Saving…' : 'Save'}</Button></div>
            </form>
          </Modal>
        </>
      )}

      {/* ── Work Orders ── */}
      {tab === 'maintenance' && (
        <>
          <div className="flex justify-end mb-4"><Button onClick={() => setShowWOModal(true)}><Plus className="h-4 w-4 mr-2" /> Create Work Order</Button></div>
          <Card padding="none">
            <Table>
              <TableHead><TableRow><TableHeader>Title</TableHeader><TableHeader>Unit</TableHeader><TableHeader>Category</TableHeader><TableHeader>Priority</TableHeader><TableHeader>Status</TableHeader><TableHeader>Vendor</TableHeader><TableHeader></TableHeader></TableRow></TableHead>
              <TableBody>
                {workOrders.length === 0 && <TableEmptyState message="No work orders" />}
                {workOrders.map(w => (
                  <TableRow key={w.id}>
                    <TableCell><Link href={`/dashboard/workorders/${w.id}`} className="font-medium text-blue-600 hover:underline">{w.title}</Link></TableCell>
                    <TableCell className="text-gray-500 text-sm">{w.unit?.unitNumber ?? '—'}</TableCell>
                    <TableCell className="text-gray-500 text-xs">{w.category}</TableCell>
                    <TableCell><WorkOrderPriorityBadge priority={w.priority} /></TableCell>
                    <TableCell><WorkOrderStatusBadge status={w.status} /></TableCell>
                    <TableCell className="text-gray-500 text-sm">{w.assignedVendor?.name ?? '—'}</TableCell>
                    <TableCell>{!['COMPLETED', 'CANCELED'].includes(w.status) && <button onClick={() => advanceWOStatus(w.id, w.status)} className="text-xs text-blue-600 hover:underline">Advance →</button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Modal isOpen={showWOModal} onClose={() => setShowWOModal(false)} title="Create Work Order">
            <form onSubmit={handleAddWO} className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Title</label><input className={INPUT_CLS} value={woForm.title} onChange={e => setWoForm({ ...woForm, title: e.target.value })} required /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea className={INPUT_CLS} rows={3} value={woForm.description} onChange={e => setWoForm({ ...woForm, description: e.target.value })} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Category</label><select className={INPUT_CLS} value={woForm.category} onChange={e => setWoForm({ ...woForm, category: e.target.value })}>{['PLUMBING', 'HVAC', 'ELECTRICAL', 'GENERAL', 'TURNOVER', 'OTHER'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Priority</label><select className={INPUT_CLS} value={woForm.priority} onChange={e => setWoForm({ ...woForm, priority: e.target.value })}>{['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'].map(p => <option key={p} value={p}>{p}</option>)}</select></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Unit (optional)</label><select className={INPUT_CLS} value={woForm.unitId} onChange={e => setWoForm({ ...woForm, unitId: e.target.value })}><option value="">— Property-wide —</option>{units.map(u => <option key={u.id} value={u.id}>Unit {u.unitNumber}</option>)}</select></div>
              <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowWOModal(false)}>Cancel</Button><Button type="submit" disabled={savingWO}>{savingWO ? 'Saving…' : 'Create'}</Button></div>
            </form>
          </Modal>
        </>
      )}

      {/* ── Vendors ── */}
      {tab === 'vendors' && (
        <>
          <div className="flex gap-2 mb-4">
            <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1" value={vendorToLink} onChange={e => setVendorToLink(e.target.value)}>
              <option value="">Link a vendor…</option>
              {unlinkableVendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <Button onClick={handleLinkVendor} disabled={!vendorToLink}>Link</Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {vendors.map((v: any) => (
              <Card key={v.id}>
                <div className="flex items-start justify-between">
                  <div><p className="font-semibold">{v.name}</p>{v.email && <p className="text-sm text-gray-500">{v.email}</p>}{v.phone && <p className="text-sm text-gray-500">{v.phone}</p>}<p className="text-xs text-gray-400 mt-1">{v.serviceCategories?.join(', ')}</p></div>
                  <button onClick={() => handleUnlinkVendor(v.id)} className="text-xs text-red-500 hover:underline ml-2">Unlink</button>
                </div>
              </Card>
            ))}
            {vendors.length === 0 && <p className="text-gray-500 col-span-full text-center py-8">No vendors linked to this property.</p>}
          </div>
        </>
      )}

      {/* ── Documents ── */}
      {tab === 'documents' && (
        <>
          <div className="flex justify-end mb-4">
            <Button onClick={() => { setDocScopeType('property'); setDocScopeId(id as string); setShowDocModal(true) }}>
              <Upload className="h-4 w-4 mr-2" /> Upload Document
            </Button>
          </div>
          {docsLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
          ) : (
            <Card padding="none">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>File Name</TableHeader>
                    <TableHeader>Scope</TableHeader>
                    <TableHeader>Uploaded By</TableHeader>
                    <TableHeader>Date</TableHeader>
                    <TableHeader></TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {documents.length === 0 && <TableEmptyState message="No documents yet. Upload one to get started." />}
                  {documents.map(doc => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <span className="font-medium text-sm">{doc.fileName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-500 text-sm capitalize">{doc.scopeType}</TableCell>
                      <TableCell className="text-gray-500 text-sm">{doc.uploadedBy?.name}</TableCell>
                      <TableCell className="text-gray-500 text-sm">{formatDate(doc.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                          <button onClick={() => handleDeleteDoc(doc.id)} className="text-red-400 hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* Upload modal */}
          <Modal isOpen={showDocModal} onClose={() => { setShowDocModal(false); setDocFile(null) }} title="Upload Document">
            <form onSubmit={handleUploadDoc} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
                <select className={INPUT_CLS} value={docScopeType} onChange={e => {
                  setDocScopeType(e.target.value)
                  setDocScopeId(e.target.value === 'property' ? (id as string) : '')
                }}>
                  <option value="property">Property</option>
                  <option value="unit">Unit</option>
                  <option value="lease">Lease</option>
                  <option value="workorder">Work Order</option>
                </select>
              </div>
              {docScopeType !== 'property' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {docScopeType === 'unit' ? 'Unit' : docScopeType === 'lease' ? 'Lease' : 'Work Order'}
                  </label>
                  <select className={INPUT_CLS} value={docScopeId} onChange={e => setDocScopeId(e.target.value)} required>
                    <option value="">Select…</option>
                    {docScopeType === 'unit' && units.map(u => <option key={u.id} value={u.id}>Unit {u.unitNumber}</option>)}
                    {docScopeType === 'lease' && leases.map(l => <option key={l.id} value={l.id}>{l.tenant?.user?.name} — Unit {l.unit?.unitNumber} ({l.status})</option>)}
                    {docScopeType === 'workorder' && workOrders.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File *</label>
                <div
                  className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {docFile ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
                      <FileText className="h-5 w-5 text-blue-600" />
                      {docFile.name}
                      <button type="button" onClick={e => { e.stopPropagation(); setDocFile(null) }} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-gray-400 mx-auto mb-1" />
                      <p className="text-sm text-gray-500">Click to select a file</p>
                    </>
                  )}
                  <input ref={fileInputRef} type="file" className="hidden" onChange={e => setDocFile(e.target.files?.[0] ?? null)} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => { setShowDocModal(false); setDocFile(null) }}>Cancel</Button>
                <Button type="submit" disabled={!docFile || !docScopeId || uploadingDoc}>{uploadingDoc ? 'Uploading…' : 'Upload'}</Button>
              </div>
            </form>
          </Modal>
        </>
      )}

      {/* ── Assets Tab ── */}
      {tab === 'assets' && (
        <>
          <div className="flex justify-end mb-4">
            <Button onClick={() => setShowAssetModal(true)}><Plus className="h-4 w-4 mr-2" /> Add Asset</Button>
          </div>
          {assetsLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
          ) : (
            <Card padding="none">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Name</TableHeader>
                    <TableHeader>Category</TableHeader>
                    <TableHeader>Unit</TableHeader>
                    <TableHeader>Condition</TableHeader>
                    <TableHeader>Install Date</TableHeader>
                    <TableHeader>Warranty Expiry</TableHeader>
                    <TableHeader></TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {assets.length === 0 && <TableEmptyState message="No assets tracked yet. Add your first asset." />}
                  {assets.map(asset => {
                    const now = new Date()
                    const warrantyExpiring = asset.warrantyExpiry && new Date(asset.warrantyExpiry) > now && new Date(asset.warrantyExpiry) <= new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
                    const warrantyExpired = asset.warrantyExpiry && new Date(asset.warrantyExpiry) <= now
                    return (
                      <TableRow key={asset.id}>
                        <TableCell className="font-medium text-sm">{asset.name}{asset.brand && <span className="text-gray-400 font-normal ml-1">({asset.brand})</span>}</TableCell>
                        <TableCell className="text-gray-500 text-xs">{asset.category}</TableCell>
                        <TableCell className="text-gray-500 text-sm">{asset.unit ? `Unit ${asset.unit.unitNumber}` : '—'}</TableCell>
                        <TableCell>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${asset.condition === 'GOOD' ? 'bg-green-50 text-green-700' : asset.condition === 'FAIR' ? 'bg-yellow-50 text-yellow-700' : asset.condition === 'POOR' ? 'bg-orange-50 text-orange-700' : 'bg-red-50 text-red-700'}`}>{asset.condition}</span>
                        </TableCell>
                        <TableCell className="text-gray-500 text-sm">{asset.installDate ? formatDate(asset.installDate) : '—'}</TableCell>
                        <TableCell>
                          {asset.warrantyExpiry ? (
                            <span className={`text-sm ${warrantyExpired ? 'text-red-600 font-medium' : warrantyExpiring ? 'text-orange-600 font-medium' : 'text-gray-500'}`}>
                              {formatDate(asset.warrantyExpiry)}{warrantyExpiring ? ' ⚠' : warrantyExpired ? ' ✗' : ''}
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          <button onClick={() => handleDeleteAsset(asset.id)} className="text-xs text-red-400 hover:text-red-600 hover:underline">Delete</button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
          {/* PM Schedules */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">PM Schedules</h3>
              <button onClick={() => setShowPMModal(true)} className="text-sm text-blue-600 hover:underline flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Add Schedule</button>
            </div>
            {pmSchedules.length === 0 ? (
              <p className="text-sm text-gray-400">No PM schedules configured.</p>
            ) : (
              <div className="space-y-2">
                {pmSchedules.map((pm: any) => {
                  const isDue = new Date(pm.nextDueAt) <= now
                  return (
                    <div key={pm.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 text-sm">
                      <div>
                        <span className="font-medium">{pm.title}</span>
                        <span className="text-gray-400 ml-2 text-xs">every {pm.frequencyDays}d · {pm.asset?.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs ${isDue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                          Due: {formatDate(pm.nextDueAt)}{isDue ? ' (overdue)' : ''}
                        </span>
                        <button onClick={() => handleDeletePM(pm.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <Modal isOpen={showPMModal} onClose={() => setShowPMModal(false)} title="Add PM Schedule">
            <form onSubmit={handleAddPM} className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Asset *</label>
                <select className={INPUT_CLS} required value={pmForm.assetId} onChange={e => setPmForm({ ...pmForm, assetId: e.target.value })}>
                  <option value="">Select asset…</option>
                  {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Title *</label><input className={INPUT_CLS} required value={pmForm.title} onChange={e => setPmForm({ ...pmForm, title: e.target.value })} placeholder="e.g. Annual HVAC Filter Replacement" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Frequency (days) *</label><input type="number" min="1" className={INPUT_CLS} required value={pmForm.frequencyDays} onChange={e => setPmForm({ ...pmForm, frequencyDays: e.target.value })} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">First Due Date *</label><input type="date" className={INPUT_CLS} required value={pmForm.nextDueAt} onChange={e => setPmForm({ ...pmForm, nextDueAt: e.target.value })} /></div>
              </div>
              <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowPMModal(false)}>Cancel</Button><Button type="submit" disabled={savingPM}>{savingPM ? 'Saving…' : 'Add Schedule'}</Button></div>
            </form>
          </Modal>

          <Modal isOpen={showAssetModal} onClose={() => setShowAssetModal(false)} title="Add Asset">
            <form onSubmit={handleAddAsset} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Name *</label><input className={INPUT_CLS} value={assetForm.name} onChange={e => setAssetForm({ ...assetForm, name: e.target.value })} required placeholder="e.g. HVAC Unit A" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Category *</label><select className={INPUT_CLS} value={assetForm.category} onChange={e => setAssetForm({ ...assetForm, category: e.target.value })}>{['HVAC', 'ELEVATOR', 'PLUMBING', 'ELECTRICAL', 'APPLIANCE', 'ROOF', 'STRUCTURAL', 'OTHER'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Brand</label><input className={INPUT_CLS} value={assetForm.brand} onChange={e => setAssetForm({ ...assetForm, brand: e.target.value })} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Condition</label><select className={INPUT_CLS} value={assetForm.condition} onChange={e => setAssetForm({ ...assetForm, condition: e.target.value })}>{['GOOD', 'FAIR', 'POOR', 'FAILED'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Install Date</label><input type="date" className={INPUT_CLS} value={assetForm.installDate} onChange={e => setAssetForm({ ...assetForm, installDate: e.target.value })} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Warranty Expiry</label><input type="date" className={INPUT_CLS} value={assetForm.warrantyExpiry} onChange={e => setAssetForm({ ...assetForm, warrantyExpiry: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Replacement Cost</label><input type="number" className={INPUT_CLS} value={assetForm.replacementCost} onChange={e => setAssetForm({ ...assetForm, replacementCost: e.target.value })} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Unit (optional)</label><select className={INPUT_CLS} value={assetForm.unitId} onChange={e => setAssetForm({ ...assetForm, unitId: e.target.value })}><option value="">Property-wide</option>{units.map(u => <option key={u.id} value={u.id}>Unit {u.unitNumber}</option>)}</select></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Serial / Model #</label><input className={INPUT_CLS} value={assetForm.serialNumber} onChange={e => setAssetForm({ ...assetForm, serialNumber: e.target.value })} placeholder="Serial or model number" /></div>
              <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowAssetModal(false)}>Cancel</Button><Button type="submit" disabled={savingAsset}>{savingAsset ? 'Saving…' : 'Add Asset'}</Button></div>
            </form>
          </Modal>
        </>
      )}

      {/* ── Inspections Tab ── */}
      {tab === 'inspections' && (
        <>
          <div className="flex justify-end mb-4">
            <Button onClick={() => setShowInspectionModal(true)}><Plus className="h-4 w-4 mr-2" /> Schedule Inspection</Button>
          </div>
          {inspectionsLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
          ) : (
            <Card padding="none">
              <Table>
                <TableHead><TableRow><TableHeader>Type</TableHeader><TableHeader>Unit</TableHeader><TableHeader>Scheduled</TableHeader><TableHeader>Status</TableHeader><TableHeader>Items</TableHeader><TableHeader></TableHeader></TableRow></TableHead>
                <TableBody>
                  {inspections.length === 0 && <TableEmptyState message="No inspections scheduled" />}
                  {inspections.map((insp: any) => {
                    const isOverdue = insp.status === 'SCHEDULED' && new Date(insp.scheduledAt) < now
                    return (
                      <TableRow key={insp.id}>
                        <TableCell className="text-sm font-medium">{insp.type.replace(/_/g, ' ')}</TableCell>
                        <TableCell className="text-sm text-gray-500">{insp.unit ? `Unit ${insp.unit.unitNumber}` : 'Property-wide'}</TableCell>
                        <TableCell className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>{formatDate(insp.scheduledAt)}</TableCell>
                        <TableCell><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${insp.status === 'COMPLETED' ? 'bg-green-50 text-green-700' : insp.status === 'SCHEDULED' ? 'bg-blue-50 text-blue-700' : 'bg-yellow-50 text-yellow-700'}`}>{insp.status.replace(/_/g, ' ')}</span></TableCell>
                        <TableCell className="text-sm text-gray-400">{insp._count?.items ?? 0}</TableCell>
                        <TableCell><Link href={`/dashboard/inspections/${insp.id}`} className="text-sm text-blue-600 hover:underline">View</Link></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
          <Modal isOpen={showInspectionModal} onClose={() => setShowInspectionModal(false)} title="Schedule Inspection">
            <form onSubmit={handleAddInspection} className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select className={INPUT_CLS} value={inspectionForm.type} onChange={e => setInspectionForm({ ...inspectionForm, type: e.target.value })}>
                  {['MOVE_IN', 'MOVE_OUT', 'ROUTINE', 'DRIVE_BY'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Unit (optional)</label>
                <select className={INPUT_CLS} value={inspectionForm.unitId} onChange={e => setInspectionForm({ ...inspectionForm, unitId: e.target.value })}>
                  <option value="">Property-wide</option>
                  {units.map(u => <option key={u.id} value={u.id}>Unit {u.unitNumber}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Date</label>
                <input type="datetime-local" className={INPUT_CLS} required value={inspectionForm.scheduledAt} onChange={e => setInspectionForm({ ...inspectionForm, scheduledAt: e.target.value })} />
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea className={INPUT_CLS} rows={2} value={inspectionForm.notes} onChange={e => setInspectionForm({ ...inspectionForm, notes: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowInspectionModal(false)}>Cancel</Button><Button type="submit" disabled={savingInspection}>{savingInspection ? 'Saving…' : 'Schedule'}</Button></div>
            </form>
          </Modal>
        </>
      )}

      {/* ── Compliance Tab ── */}
      {tab === 'compliance' && (
        <>
          <div className="flex justify-end mb-4">
            <Button onClick={() => setShowComplianceModal(true)}><Plus className="h-4 w-4 mr-2" /> Add Item</Button>
          </div>
          {complianceLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
          ) : (
            <Card padding="none">
              <Table>
                <TableHead><TableRow><TableHeader>Item</TableHeader><TableHeader>Category</TableHeader><TableHeader>Due Date</TableHeader><TableHeader>Status</TableHeader><TableHeader></TableHeader></TableRow></TableHead>
                <TableBody>
                  {complianceItems.length === 0 && <TableEmptyState message="No compliance items" />}
                  {complianceItems.map((item: any) => {
                    const daysLeft = Math.round((new Date(item.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                    const isOverdue = daysLeft < 0 && item.status !== 'COMPLIANT' && item.status !== 'WAIVED'
                    const isDueSoon = daysLeft >= 0 && daysLeft <= 30 && item.status !== 'COMPLIANT' && item.status !== 'WAIVED'
                    return (
                      <TableRow key={item.id}>
                        <TableCell><div className="font-medium text-sm">{item.title}</div>{item.authority && <div className="text-xs text-gray-400">{item.authority}</div>}</TableCell>
                        <TableCell className="text-xs text-gray-500">{item.category.replace(/_/g, ' ')}</TableCell>
                        <TableCell>
                          <div className={`text-sm font-medium ${isOverdue ? 'text-red-600' : isDueSoon ? 'text-yellow-600' : 'text-gray-700'}`}>{formatDate(item.dueDate)}</div>
                          <div className={`text-xs ${isOverdue ? 'text-red-400' : isDueSoon ? 'text-yellow-500' : 'text-gray-400'}`}>{isOverdue ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}</div>
                        </TableCell>
                        <TableCell><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.status === 'COMPLIANT' ? 'bg-green-50 text-green-700' : item.status === 'OVERDUE' ? 'bg-red-50 text-red-700' : item.status === 'PENDING' ? 'bg-yellow-50 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>{item.status}</span></TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {item.status !== 'COMPLIANT' && item.status !== 'WAIVED' && <button onClick={() => handleMarkCompliant(item.id)} className="text-xs text-green-600 hover:underline">Compliant</button>}
                            <button onClick={() => handleDeleteCompliance(item.id)} className="text-xs text-red-400 hover:underline">Delete</button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
          <Modal isOpen={showComplianceModal} onClose={() => setShowComplianceModal(false)} title="Add Compliance Item">
            <form onSubmit={handleAddCompliance} className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Title *</label><input className={INPUT_CLS} required value={complianceForm.title} onChange={e => setComplianceForm({ ...complianceForm, title: e.target.value })} placeholder="e.g. Annual Fire Inspection" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select className={INPUT_CLS} value={complianceForm.category} onChange={e => setComplianceForm({ ...complianceForm, category: e.target.value })}>
                    {['FIRE_SAFETY', 'ELEVATOR', 'HEALTH_PERMIT', 'BUILDING_PERMIT', 'HVAC_CERT', 'ELECTRICAL', 'PLUMBING', 'OTHER'].map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label><input type="date" className={INPUT_CLS} required value={complianceForm.dueDate} onChange={e => setComplianceForm({ ...complianceForm, dueDate: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Authority</label><input className={INPUT_CLS} value={complianceForm.authority} onChange={e => setComplianceForm({ ...complianceForm, authority: e.target.value })} placeholder="e.g. City Fire Marshal" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Renewal Days</label><input type="number" className={INPUT_CLS} value={complianceForm.renewalDays} onChange={e => setComplianceForm({ ...complianceForm, renewalDays: e.target.value })} placeholder="365" /></div>
              </div>
              <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowComplianceModal(false)}>Cancel</Button><Button type="submit" disabled={savingCompliance}>{savingCompliance ? 'Saving…' : 'Add Item'}</Button></div>
            </form>
          </Modal>
        </>
      )}

      {/* ── Renewal Offer Modal (global, not tied to a tab) ── */}
      <Modal isOpen={!!renewalLeaseId} onClose={() => setRenewalLeaseId(null)} title="Send Renewal Offer">
        <form onSubmit={handleSendRenewalOffer} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Offered Rent</label><input type="number" step="0.01" className={INPUT_CLS} value={renewalForm.offeredRent} onChange={e => setRenewalForm({ ...renewalForm, offeredRent: e.target.value })} required /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Term (months)</label><input type="number" className={INPUT_CLS} value={renewalForm.termMonths} onChange={e => setRenewalForm({ ...renewalForm, termMonths: e.target.value })} required /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Offer Expiry Date</label><input type="date" className={INPUT_CLS} value={renewalForm.expiryDate} onChange={e => setRenewalForm({ ...renewalForm, expiryDate: e.target.value })} required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label><textarea className={INPUT_CLS} rows={2} value={renewalForm.notes} onChange={e => setRenewalForm({ ...renewalForm, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setRenewalLeaseId(null)}>Cancel</Button><Button type="submit" disabled={savingRenewal}>{savingRenewal ? 'Sending…' : 'Send Offer'}</Button></div>
        </form>
      </Modal>

      {/* ── AI Renewal Letter Modal ── */}
      {renewalLetterState && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Wand2 className="h-4 w-4 text-indigo-500" /> Draft Renewal Letter</h2>
              <button onClick={() => setRenewalLetterState(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {!renewalLetterState.text && !renewalLetterState.generating && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Offered Rent ($)</label>
                    <input type="number" step="0.01" className={INPUT_CLS} value={renewalLetterState.offeredRent} onChange={e => setRenewalLetterState(s => s ? { ...s, offeredRent: e.target.value } : null)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Term (months)</label>
                    <input type="number" className={INPUT_CLS} value={renewalLetterState.termMonths} onChange={e => setRenewalLetterState(s => s ? { ...s, termMonths: e.target.value } : null)} />
                  </div>
                </div>
              )}
              {renewalLetterState.generating && !renewalLetterState.text && (
                <p className="text-sm text-gray-400"><span className="animate-pulse">Drafting letter…</span></p>
              )}
              {renewalLetterState.text && (
                <textarea
                  readOnly
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none"
                  rows={14}
                  value={renewalLetterState.text + (renewalLetterState.generating ? '\n…' : '')}
                />
              )}
              <div className="flex justify-end gap-2">
                {!renewalLetterState.text && !renewalLetterState.generating && (
                  <Button onClick={streamRenewalLetter}>
                    <Wand2 className="h-4 w-4 mr-2" /> Generate Letter
                  </Button>
                )}
                {renewalLetterState.text && !renewalLetterState.generating && (
                  <Button onClick={() => { navigator.clipboard.writeText(renewalLetterState.text) }}>Copy</Button>
                )}
                <Button variant="ghost" onClick={() => setRenewalLetterState(null)}>Close</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Unit Detail Drawer ── */}
      {drawerUnitId && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setDrawerUnitId(null)} />
          {/* Drawer */}
          <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {drawerUnit ? `Unit ${drawerUnit.unitNumber}` : 'Unit Details'}
              </h2>
              <button onClick={() => setDrawerUnitId(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {drawerLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
              </div>
            ) : drawerUnit && (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Unit summary */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-0.5">Status</p>
                    <UnitStatusBadge status={drawerUnit.status} />
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-0.5">Rent</p>
                    <p className="font-semibold">{formatCurrency(drawerUnit.monthlyRent)}/mo</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-0.5">Bedrooms / Baths</p>
                    <p className="font-medium">{drawerUnit.bedrooms} BR / {drawerUnit.bathrooms} BA</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-0.5">Sq Ft</p>
                    <p className="font-medium">{drawerUnit.sqFt?.toLocaleString()}</p>
                  </div>
                </div>

                {/* Current lease */}
                {drawerUnit.leases?.length > 0 && (() => {
                  const activeLease = drawerUnit.leases.find((l: any) => l.status === 'ACTIVE') ?? drawerUnit.leases[0]
                  return (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Current Lease</h3>
                      <div className="border border-gray-200 rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{activeLease.tenant?.user?.name}</p>
                          <LeaseStatusBadge status={activeLease.status} />
                        </div>
                        <p className="text-sm text-gray-500">{activeLease.tenant?.user?.email}</p>
                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 pt-1">
                          <div><span className="font-medium text-gray-700">Start:</span> {formatDate(activeLease.startDate)}</div>
                          <div><span className="font-medium text-gray-700">End:</span> {formatDate(activeLease.endDate)}</div>
                          <div><span className="font-medium text-gray-700">Rent:</span> {formatCurrency(activeLease.monthlyRent)}/mo</div>
                          <div><span className="font-medium text-gray-700">Deposit:</span> {formatCurrency(activeLease.depositAmount)}</div>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* Lease history */}
                {drawerUnit.leases?.length > 1 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Lease History</h3>
                    <div className="space-y-2">
                      {drawerUnit.leases.slice(1).map((l: any) => (
                        <div key={l.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-100 last:border-0">
                          <div>
                            <p className="font-medium text-gray-700">{l.tenant?.user?.name}</p>
                            <p className="text-xs text-gray-400">{formatDate(l.startDate)} → {formatDate(l.endDate)}</p>
                          </div>
                          <LeaseStatusBadge status={l.status} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Work orders */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Work Orders ({drawerUnit.workOrders?.length ?? 0})</h3>
                  {drawerUnit.workOrders?.length === 0 ? (
                    <p className="text-sm text-gray-400">No work orders for this unit.</p>
                  ) : (
                    <div className="space-y-2">
                      {drawerUnit.workOrders?.map((w: any) => (
                        <div key={w.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-100 last:border-0">
                          <div>
                            <Link href={`/dashboard/workorders/${w.id}`} className="font-medium text-blue-600 hover:underline">{w.title}</Link>
                            <p className="text-xs text-gray-400">{w.category} · {formatDate(w.createdAt)}</p>
                          </div>
                          <WorkOrderStatusBadge status={w.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer link */}
                <div className="pt-2">
                  <Link href={`/dashboard/units/${drawerUnitId}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                    <ExternalLink className="h-3.5 w-3.5" /> Open full unit page
                  </Link>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
