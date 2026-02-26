'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { ChevronLeft, Plus, Upload, FileText, ExternalLink, Trash2, Star, CheckCircle, MessageSquare, Send, Wand2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { WorkOrderPriorityBadge, WorkOrderStatusBadge } from '@/components/ui/Badge'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { formatCurrency, formatDate } from '@/lib/utils'

const STATUS_FLOW = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELED']
const VALID_NEXT: Record<string, string[]> = {
  NEW: ['ASSIGNED', 'CANCELED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELED'],
  IN_PROGRESS: ['BLOCKED', 'COMPLETED', 'CANCELED'],
  BLOCKED: ['IN_PROGRESS', 'CANCELED'],
}

export default function WorkOrderDetailPage() {
  const { id } = useParams()
  const { data: session } = useSession()
  const isManager = session?.user?.systemRole === 'ADMIN' || session?.user?.systemRole === 'MANAGER'

  const [wo, setWo] = useState<any>(null)
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [costForm, setCostForm] = useState({ costType: 'LABOR', amount: '', memo: '' })
  const [addingCost, setAddingCost] = useState(false)
  const [showCostForm, setShowCostForm] = useState(false)

  // Attachments
  const [documents, setDocuments] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Bids
  const [bids, setBids] = useState<any[]>([])
  const [showBidForm, setShowBidForm] = useState(false)
  const [bidVendorId, setBidVendorId] = useState('')
  const [sendingBid, setSendingBid] = useState(false)

  // Vendor review
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [reviewForm, setReviewForm] = useState({ score: 5, quality: 5, responseTime: '', notes: '' })
  const [submittingReview, setSubmittingReview] = useState(false)

  // Sign-off
  const [signOffNotes, setSignOffNotes] = useState('')
  const [signingOff, setSigningOff] = useState(false)
  // Signer name resolved async
  const [signerName, setSignerName] = useState<string | null>(null)

  // Vendor messages
  const [messages, setMessages] = useState<any[]>([])
  const [msgBody, setMsgBody] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)

  // Invoice / paid state per cost row (keyed by cost id)
  const [costEdits, setCostEdits] = useState<Record<string, { invoiceNumber: string }>>({})

  // AI Diagnosis
  const [aiDiagnosis, setAiDiagnosis] = useState('')
  const [diagnosing, setDiagnosing] = useState(false)

  // Vendor Recommend
  const [vendorRec, setVendorRec] = useState<{ vendorId: string; vendorName: string; reason: string } | null>(null)
  const [loadingRec, setLoadingRec] = useState(false)

  // Cost anomaly
  const [costAnomalies, setCostAnomalies] = useState<{ anomalies: { costType: string; severity: string; note: string }[] } | null>(null)
  const [checkingAnomalies, setCheckingAnomalies] = useState(false)

  async function handleCheckAnomalies() {
    setCheckingAnomalies(true)
    setCostAnomalies(null)
    const res = await fetch('/api/ai/cost-anomaly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workOrderId: id }),
    })
    const data = await res.json()
    if (!data.error) setCostAnomalies(data)
    setCheckingAnomalies(false)
  }

  const load = useCallback(async () => {
    const res = await fetch(`/api/workorders/${id}`)
    const data = await res.json()
    setWo(data)
    setLoading(false)
    // Init cost edits
    if (data?.costs) {
      const edits: Record<string, { invoiceNumber: string }> = {}
      for (const c of data.costs) {
        edits[c.id] = { invoiceNumber: c.invoiceNumber ?? '' }
      }
      setCostEdits(edits)
    }
  }, [id])

  const loadBids = useCallback(async () => {
    const res = await fetch(`/api/workorders/${id}/bids`)
    const data = await res.json()
    setBids(Array.isArray(data) ? data : [])
  }, [id])

  const loadDocs = useCallback(async () => {
    const res = await fetch(`/api/documents?scopeType=workorder&scopeId=${id}`)
    const data = await res.json()
    setDocuments(Array.isArray(data) ? data : [])
  }, [id])

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/workorders/${id}/messages`)
    const data = await res.json()
    setMessages(Array.isArray(data) ? data : [])
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadDocs() }, [loadDocs])
  useEffect(() => { if (isManager) loadBids() }, [isManager, loadBids])
  useEffect(() => { if (isManager) loadMessages() }, [isManager, loadMessages])
  useEffect(() => { if (isManager) fetch('/api/vendors').then(r => r.json()).then(setVendors) }, [isManager])

  // Resolve signer name when wo loads and has a signedOffBy
  useEffect(() => {
    if (wo?.signedOffBy && !signerName) {
      fetch(`/api/users/${wo.signedOffBy}`).then(r => r.json()).then(u => {
        if (u?.name) setSignerName(u.name)
      }).catch(() => {})
    }
  }, [wo?.signedOffBy, signerName])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('scopeType', 'workorder')
    fd.append('scopeId', id as string)
    fd.append('workOrderId', id as string)
    await fetch('/api/documents', { method: 'POST', body: fd })
    setUploading(false)
    loadDocs()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDeleteDoc(docId: string) {
    await fetch(`/api/documents/${docId}`, { method: 'DELETE' })
    loadDocs()
  }

  async function handleSubmitReview(e: React.FormEvent) {
    e.preventDefault()
    if (!wo?.assignedVendor) return
    setSubmittingReview(true)
    await fetch(`/api/vendors/${wo.assignedVendor.id}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workOrderId: id, ...reviewForm, score: parseInt(String(reviewForm.score)), quality: parseInt(String(reviewForm.quality)), responseTime: reviewForm.responseTime ? parseInt(reviewForm.responseTime) : undefined }),
    })
    setSubmittingReview(false)
    setShowReviewForm(false)
    load()
  }

  async function handleSignOff() {
    setSigningOff(true)
    await fetch(`/api/workorders/${id}/signoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signOffNotes }),
    })
    setSigningOff(false)
    load()
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!msgBody.trim()) return
    setSendingMsg(true)
    await fetch(`/api/workorders/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: msgBody }),
    })
    setMsgBody('')
    setSendingMsg(false)
    loadMessages()
  }

  async function saveInvoiceNumber(costId: string) {
    const invoice = costEdits[costId]?.invoiceNumber ?? ''
    await fetch(`/api/workorders/${id}/costs/${costId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceNumber: invoice }),
    })
    load()
  }

  async function markCostPaid(costId: string) {
    await fetch(`/api/workorders/${id}/costs/${costId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid: true }),
    })
    load()
  }

  async function changeStatus(status: string) {
    setSaving(true)
    await fetch(`/api/workorders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    setSaving(false); load()
  }

  async function assignVendor(vendorId: string) {
    await fetch(`/api/workorders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignedVendorId: vendorId || null }) })
    load()
  }

  async function requestBid(e: React.FormEvent) {
    e.preventDefault()
    if (!bidVendorId) return
    setSendingBid(true)
    await fetch(`/api/workorders/${id}/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorIds: [bidVendorId] }),
    })
    setSendingBid(false)
    setBidVendorId('')
    setShowBidForm(false)
    loadBids()
  }

  async function respondBid(bidId: string, status: 'ACCEPTED' | 'DECLINED', amount?: number) {
    await fetch(`/api/workorders/${id}/bids/${bidId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, amount }),
    })
    loadBids()
    load()
  }

  async function addCost(e: React.FormEvent) {
    e.preventDefault(); setAddingCost(true)
    await fetch(`/api/workorders/${id}/costs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...costForm, amount: parseFloat(costForm.amount) }) })
    setAddingCost(false); setShowCostForm(false); setCostForm({ costType: 'LABOR', amount: '', memo: '' }); load()
  }

  async function handleAIDiagnose() {
    setDiagnosing(true)
    setAiDiagnosis('')
    const res = await fetch('/api/ai/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workOrderId: id }),
    })
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      setAiDiagnosis(t => t + dec.decode(value, { stream: true }))
    }
    setDiagnosing(false)
  }

  async function handleVendorRecommend() {
    setLoadingRec(true)
    setVendorRec(null)
    const res = await fetch('/api/ai/vendor-recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workOrderId: id }),
    })
    const data = await res.json()
    if (!data.error) setVendorRec(data)
    setLoadingRec(false)
  }

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
  if (!wo || wo.error) return <div className="text-center py-20 text-gray-500">Work order not found.</div>

  const nextStatuses = VALID_NEXT[wo.status] ?? []
  const totalCost = (wo.costs ?? []).reduce((s: number, c: any) => s + c.amount, 0)

  return (
    <div>
      <Link href="/dashboard/workorders" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="h-4 w-4" /> Back to Work Orders
      </Link>
      <PageHeader title={wo.title} subtitle={`${wo.property?.name}${wo.unit ? ` · Unit ${wo.unit.unitNumber}` : ''}`} />

      {/* Status timeline */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto">
        {STATUS_FLOW.filter(s => s !== 'CANCELED').map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${wo.status === s ? 'bg-blue-600 text-white' : STATUS_FLOW.indexOf(wo.status) > STATUS_FLOW.indexOf(s) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>{s.replace('_', ' ')}</div>
            {i < STATUS_FLOW.filter(s => s !== 'CANCELED').length - 1 && <div className="w-4 h-px bg-gray-300 flex-shrink-0" />}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">Details</h3>
            <p className="text-gray-600 text-sm mb-4">{wo.description}</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Category:</span> <span className="font-medium ml-1">{wo.category}</span></div>
              <div><span className="text-gray-500">Priority:</span> <span className="ml-1"><WorkOrderPriorityBadge priority={wo.priority} /></span></div>
              <div><span className="text-gray-500">Status:</span> <span className="ml-1"><WorkOrderStatusBadge status={wo.status} /></span></div>
              <div><span className="text-gray-500">Submitted by:</span> <span className="font-medium ml-1">{wo.submittedBy?.name}</span></div>
              <div><span className="text-gray-500">Created:</span> <span className="font-medium ml-1">{formatDate(wo.createdAt)}</span></div>
              {wo.completedAt && <div><span className="text-gray-500">Completed:</span> <span className="font-medium ml-1">{formatDate(wo.completedAt)}</span></div>}
            </div>
          </Card>

          {/* Attachments */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Attachments</h3>
              <label className="cursor-pointer flex items-center gap-1 text-sm text-blue-600 hover:underline">
                <Upload className="h-4 w-4" />
                {uploading ? 'Uploading…' : 'Upload'}
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
            </div>
            {documents.length === 0 ? (
              <p className="text-sm text-gray-400">No attachments yet.</p>
            ) : (
              <div className="space-y-2">
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{doc.fileName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button onClick={() => handleDeleteDoc(doc.id)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Bids */}
          {isManager && ['NEW', 'ASSIGNED'].includes(wo.status) && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Bids <span className="text-gray-400 font-normal text-sm">({bids.length})</span></h3>
                <Button variant="ghost" size="sm" onClick={() => setShowBidForm(!showBidForm)}>
                  <Plus className="h-4 w-4 mr-1" /> Request Bid
                </Button>
              </div>
              {showBidForm && (
                <form onSubmit={requestBid} className="mb-4 flex gap-2">
                  <select
                    required
                    value={bidVendorId}
                    onChange={e => setBidVendorId(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select vendor…</option>
                    {vendors.filter((v: any) => !bids.find((b: any) => b.vendorId === v.id && b.status === 'PENDING')).map((v: any) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                  <Button type="submit" size="sm" disabled={sendingBid}>{sendingBid ? 'Sending…' : 'Send'}</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowBidForm(false)}>Cancel</Button>
                </form>
              )}
              {bids.length === 0 ? (
                <p className="text-sm text-gray-400">No bids requested yet.</p>
              ) : (
                <div className="space-y-3">
                  {bids.map((bid: any) => (
                    <div key={bid.id} className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
                      <div>
                        <div className="text-sm font-medium">{bid.vendor?.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {bid.status === 'SUBMITTED' && bid.amount ? `$${bid.amount.toLocaleString()}` : ''}
                          {bid.notes ? <span className="ml-1 italic text-gray-400">{bid.notes}</span> : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          bid.status === 'ACCEPTED' ? 'bg-green-50 text-green-700' :
                          bid.status === 'DECLINED' ? 'bg-red-50 text-red-700' :
                          bid.status === 'SUBMITTED' ? 'bg-blue-50 text-blue-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>{bid.status}</span>
                        {bid.status === 'SUBMITTED' && (
                          <button
                            onClick={() => respondBid(bid.id, 'ACCEPTED', bid.amount)}
                            className="text-xs text-green-600 hover:text-green-700 font-medium"
                          >
                            Accept
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Costs — managers only */}
          {isManager && <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Costs <span className="text-gray-500 font-normal text-sm">({formatCurrency(totalCost)} total)</span></h3>
              <div className="flex items-center gap-2">
                {isManager && (
                  <button
                    onClick={handleCheckAnomalies}
                    disabled={checkingAnomalies}
                    className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium disabled:opacity-50"
                  >
                    <Wand2 className="h-3 w-3" />
                    {checkingAnomalies ? 'Checking…' : 'Check Anomalies'}
                  </button>
                )}
                <Button variant="ghost" onClick={() => setShowCostForm(!showCostForm)}><Plus className="h-4 w-4 mr-1" /> Add Cost</Button>
              </div>
            </div>
            {showCostForm && (
              <form onSubmit={addCost} className="mb-4 p-3 bg-gray-50 rounded-lg space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Type</label><select className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" value={costForm.costType} onChange={e => setCostForm({...costForm, costType: e.target.value})}>{['LABOR','PARTS','CONTRACTOR','OTHER'].map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Amount</label><input type="number" step="0.01" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" value={costForm.amount} onChange={e => setCostForm({...costForm, amount: e.target.value})} required /></div>
                </div>
                <div><label className="block text-xs font-medium text-gray-700 mb-1">Memo</label><input className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" value={costForm.memo} onChange={e => setCostForm({...costForm, memo: e.target.value})} /></div>
                <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowCostForm(false)}>Cancel</Button><Button type="submit" disabled={addingCost} size="sm">{addingCost ? 'Adding…' : 'Add'}</Button></div>
              </form>
            )}
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Type</TableHeader>
                  <TableHeader>Memo</TableHeader>
                  <TableHeader>Amount</TableHeader>
                  {isManager && <TableHeader>Invoice #</TableHeader>}
                  {isManager && <TableHeader>Paid</TableHeader>}
                </TableRow>
              </TableHead>
              <TableBody>
                {(wo.costs ?? []).length === 0 && <TableEmptyState message="No costs recorded" />}
                {(wo.costs ?? []).map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-gray-500 text-xs">{c.costType}</TableCell>
                    <TableCell className="text-gray-500 text-sm">{c.memo ?? '—'}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(c.amount)}</TableCell>
                    {isManager && (
                      <TableCell>
                        <input
                          className="border border-gray-200 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="INV-001"
                          value={costEdits[c.id]?.invoiceNumber ?? ''}
                          onChange={e => setCostEdits(prev => ({ ...prev, [c.id]: { invoiceNumber: e.target.value } }))}
                          onBlur={() => saveInvoiceNumber(c.id)}
                        />
                      </TableCell>
                    )}
                    {isManager && (
                      <TableCell>
                        {c.paid ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                            <CheckCircle className="h-3.5 w-3.5" /> {c.paidAt ? formatDate(c.paidAt) : 'Paid'}
                          </span>
                        ) : (
                          <button
                            onClick={() => markCostPaid(c.id)}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline"
                          >
                            Mark Paid
                          </button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>}

          {/* Cost anomaly banner — managers only */}
          {isManager && costAnomalies && (
            <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
              {costAnomalies.anomalies.length === 0 ? (
                <p className="text-sm text-yellow-800 font-medium">No anomalies detected.</p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-yellow-900 mb-2">Cost Anomalies Detected:</p>
                  <ul className="space-y-1">
                    {costAnomalies.anomalies.map((a, i) => (
                      <li key={i} className="text-sm text-yellow-800">
                        <span className={`font-medium ${a.severity === 'high' ? 'text-red-700' : 'text-yellow-700'}`}>[{a.severity.toUpperCase()}]</span> {a.costType}: {a.note}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {/* Vendor Messages */}
          {isManager && wo.assignedVendorId && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="h-4 w-4 text-gray-500" />
                <h3 className="font-semibold text-gray-900">Vendor Messages</h3>
              </div>
              <div className="space-y-3 max-h-60 overflow-y-auto mb-4">
                {messages.length === 0 ? (
                  <p className="text-sm text-gray-400">No messages yet.</p>
                ) : (
                  messages.map((m: any) => (
                    <div key={m.id} className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700">{m.authorName}</span>
                        <span className="text-xs text-gray-400">{formatDate(m.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{m.body}</p>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <textarea
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={2}
                  placeholder="Message to vendor…"
                  value={msgBody}
                  onChange={e => setMsgBody(e.target.value)}
                />
                <Button type="submit" size="sm" disabled={sendingMsg || !msgBody.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </Card>
          )}
        </div>

        {/* Actions sidebar */}
        <div className="space-y-4">
          {isManager && (
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">Actions</h3>
            <div className="space-y-2">
              {nextStatuses.map(s => (
                <Button key={s} onClick={() => changeStatus(s)} disabled={saving} className="w-full justify-center">
                  → {s.replace('_', ' ')}
                </Button>
              ))}
              {nextStatuses.length === 0 && <p className="text-sm text-gray-400 text-center">No further transitions</p>}
            </div>
          </Card>
          )}

          {/* Sign-off card */}
          {isManager && wo.status === 'COMPLETED' && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="h-4 w-4 text-gray-500" />
                <h3 className="font-semibold text-gray-900">Sign-off</h3>
              </div>
              {wo.signedOffAt ? (
                <div className="flex items-start gap-2 p-3 bg-green-50 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-800">Signed off</p>
                    <p className="text-xs text-green-600 mt-0.5">
                      {signerName ?? 'Manager'} · {formatDate(wo.signedOffAt)}
                    </p>
                    {wo.signOffNotes && <p className="text-xs text-green-700 mt-1 italic">&ldquo;{wo.signOffNotes}&rdquo;</p>}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    rows={2}
                    placeholder="Sign-off notes (optional)"
                    value={signOffNotes}
                    onChange={e => setSignOffNotes(e.target.value)}
                  />
                  <Button
                    onClick={handleSignOff}
                    disabled={signingOff}
                    className="w-full justify-center"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {signingOff ? 'Signing off…' : 'Sign Off Work Order'}
                  </Button>
                </div>
              )}
            </Card>
          )}

          {isManager ? (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Assign Vendor</h3>
              <button onClick={handleVendorRecommend} disabled={loadingRec} className="text-xs text-teal-600 hover:text-teal-700 font-medium disabled:opacity-50 flex items-center gap-1">
                <Wand2 className="h-3 w-3" /> {loadingRec ? 'Matching…' : 'AI Match'}
              </button>
            </div>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={wo.assignedVendor?.id ?? ''} onChange={e => assignVendor(e.target.value)}>
              <option value="">— Unassigned —</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            {vendorRec && (
              <div className="mt-2 flex items-start justify-between gap-2 px-3 py-2 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-800">
                <span>Recommended: <strong>{vendorRec.vendorName}</strong> — {vendorRec.reason}</span>
                {vendorRec.vendorId && (
                  <button
                    onClick={() => { assignVendor(vendorRec.vendorId); setVendorRec(null) }}
                    className="flex-shrink-0 font-medium text-teal-700 hover:text-teal-900 underline"
                  >
                    Apply
                  </button>
                )}
              </div>
            )}
            {wo.assignedVendor && (
              <div className="mt-2 text-sm text-gray-500">
                <p>{wo.assignedVendor.email}</p>
                <p>{wo.assignedVendor.phone}</p>
              </div>
            )}
          </Card>
          ) : wo.assignedVendor ? (
          <Card>
            <h3 className="font-semibold text-gray-900 mb-2">Assigned Vendor</h3>
            <p className="text-sm font-medium text-gray-700">{wo.assignedVendor.name}</p>
          </Card>
          ) : null}

          {/* Rate vendor — shown to managers when WO is completed and has vendor */}
          {isManager && wo.status === 'COMPLETED' && wo.assignedVendor && !wo.review && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-3">Rate Vendor</h3>
              {!showReviewForm ? (
                <Button onClick={() => setShowReviewForm(true)} className="w-full justify-center">
                  <Star className="h-4 w-4 mr-2" /> Rate {wo.assignedVendor.name}
                </Button>
              ) : (
                <form onSubmit={handleSubmitReview} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Overall Score (1–5)</label>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(s => (
                        <button key={s} type="button" onClick={() => setReviewForm(f => ({ ...f, score: s }))} className={`h-8 w-8 rounded-full text-sm font-medium transition-colors ${reviewForm.score >= s ? 'bg-yellow-400 text-white' : 'bg-gray-100 text-gray-400 hover:bg-yellow-100'}`}>{s}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Quality (1–5)</label>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(s => (
                        <button key={s} type="button" onClick={() => setReviewForm(f => ({ ...f, quality: s }))} className={`h-8 w-8 rounded-full text-sm font-medium transition-colors ${reviewForm.quality >= s ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-blue-100'}`}>{s}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Response Time (hours)</label>
                    <input type="number" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" value={reviewForm.responseTime} onChange={e => setReviewForm(f => ({ ...f, responseTime: e.target.value }))} placeholder="Optional" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                    <textarea className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" rows={2} value={reviewForm.notes} onChange={e => setReviewForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowReviewForm(false)}>Cancel</Button>
                    <Button type="submit" size="sm" disabled={submittingReview}>{submittingReview ? 'Submitting…' : 'Submit Review'}</Button>
                  </div>
                </form>
              )}
            </Card>
          )}

          {/* AI Diagnosis */}
          {isManager && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Wand2 className="h-4 w-4 text-gray-500" />
                <h3 className="font-semibold text-gray-900">AI Diagnosis</h3>
              </div>
              {!aiDiagnosis && !diagnosing && (
                <button
                  onClick={handleAIDiagnose}
                  className="w-full text-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg px-3 py-2 font-medium transition-colors flex items-center justify-center gap-1.5"
                >
                  <Wand2 className="h-4 w-4" /> Diagnose with AI
                </button>
              )}
              {diagnosing && !aiDiagnosis && (
                <p className="text-sm text-gray-400 text-center"><span className="animate-pulse">…</span></p>
              )}
              {aiDiagnosis && (
                <pre className="whitespace-pre-wrap text-sm text-gray-600 leading-relaxed">
                  {aiDiagnosis}
                  {diagnosing && <span className="animate-pulse">…</span>}
                </pre>
              )}
            </Card>
          )}

          {/* Show existing review if it exists */}
          {wo.review && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-2">Vendor Review</h3>
              <div className="flex gap-0.5 mb-1">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} className={`h-4 w-4 ${s <= wo.review.score ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
                ))}
                <span className="text-sm text-gray-500 ml-1">{wo.review.score}/5</span>
              </div>
              <p className="text-xs text-gray-500">Quality: {wo.review.quality}/5{wo.review.responseTime ? ` · Response: ${wo.review.responseTime}h` : ''}</p>
              {wo.review.notes && <p className="text-xs text-gray-500 mt-1 italic">&ldquo;{wo.review.notes}&rdquo;</p>}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
