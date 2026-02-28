'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, Home, AlertTriangle, Calendar, DollarSign, MapPin, CheckCircle, RefreshCw, PenTool, Download } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { SignaturePad } from '@/components/ui/SignaturePad'
import { LeaseStatusBadge } from '@/components/ui/Badge'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function MyLeasePage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [offers, setOffers] = useState<any[]>([])

  // Guided accept flow state
  const [renewStep, setRenewStep] = useState<0 | 1 | 2>(0)
  const [respondingOffer, setRespondingOffer] = useState<string | null>(null)
  const [acceptedEndDate, setAcceptedEndDate] = useState<string | null>(null)

  // Lease signing + PDF
  const [showSignModal, setShowSignModal] = useState(false)
  const [signingLease, setSigningLease] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)

  // Self-service request state
  const [requestTerm, setRequestTerm] = useState<6 | 12 | 24>(12)
  const [requestNote, setRequestNote] = useState('')
  const [requestSent, setRequestSent] = useState(false)
  const [requesting, setRequesting] = useState(false)

  async function load() {
    const res = await fetch('/api/portal')
    const d = await res.json()
    setData(d)
    if (d?.activeLease?.id) {
      const oRes = await fetch(`/api/leases/${d.activeLease.id}/renewal-offer`)
      const oData = await oRes.json()
      setOffers(Array.isArray(oData) ? oData : [])
    }
  }

  useEffect(() => { load().finally(() => setLoading(false)) }, [])

  async function acceptOffer(offerId: string, leaseEndDate: string, termMonths: number) {
    setRespondingOffer(offerId)
    await fetch(`/api/leases/${data.activeLease.id}/renewal-offer/${offerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ACCEPTED' }),
    })
    const newEnd = new Date(leaseEndDate)
    newEnd.setMonth(newEnd.getMonth() + termMonths)
    setAcceptedEndDate(newEnd.toLocaleDateString())
    setRespondingOffer(null)
    setRenewStep(2)
    load()
  }

  async function declineOffer(offerId: string) {
    setRespondingOffer(offerId)
    await fetch(`/api/leases/${data.activeLease.id}/renewal-offer/${offerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DECLINED' }),
    })
    setRespondingOffer(null)
    setRenewStep(0)
    load()
  }

  async function sendRenewalRequest() {
    setRequesting(true)
    await fetch(`/api/leases/${data.activeLease.id}/renewal-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ termMonths: requestTerm, notes: requestNote || undefined }),
    })
    setRequesting(false)
    setRequestSent(true)
  }

  async function handleSignLease(dataUrl: string) {
    if (!data?.activeLease?.id) return
    setSigningLease(true)
    await fetch(`/api/leases/${data.activeLease.id}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature: dataUrl }),
    })
    setSigningLease(false)
    setShowSignModal(false)
    load()
  }

  async function handleGeneratePdf() {
    if (!data?.activeLease?.id) return
    setGeneratingPdf(true)
    const res = await fetch(`/api/leases/${data.activeLease.id}/pdf`, { method: 'POST' })
    const result = await res.json()
    if (result.fileUrl) window.open(result.fileUrl, '_blank')
    setGeneratingPdf(false)
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
    </div>
  )

  const { activeLease, leaseHistory, tenant } = data ?? {}
  const property = activeLease?.unit?.property
  const unit = activeLease?.unit
  const now = new Date()
  const daysLeft = activeLease
    ? Math.round((new Date(activeLease.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null

  const pendingOffer = offers.find((o: any) => o.status === 'PENDING')
  const pastOffers = offers.filter((o: any) => o.status !== 'PENDING')

  return (
    <div>
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="h-4 w-4" /> Back to Dashboard
      </Link>
      <PageHeader title="My Lease" subtitle={activeLease ? `${property?.name} — Unit ${unit?.unitNumber}` : 'No active lease'} />

      {!activeLease ? (
        <Card className="text-center py-12">
          <Home className="h-12 w-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500">You don&apos;t have an active lease on file.</p>
          <p className="text-sm text-gray-400 mt-1">Contact your property manager for more information.</p>
        </Card>
      ) : (
        <>
          {/* Renewal section */}
          {pendingOffer ? (
            /* State A: Pending offer from manager */
            <div className="mb-5 border border-blue-200 bg-blue-50 rounded-xl p-5">
              {renewStep === 2 ? (
                /* Step 2: Success */
                <div className="flex items-center gap-3 py-2">
                  <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-green-800 text-sm">Lease renewed!</p>
                    <p className="text-green-700 text-sm mt-0.5">
                      Your lease now runs to <strong>{acceptedEndDate}</strong>.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-blue-900 text-sm">Renewal Offer from Your Manager</h3>
                      <p className="text-blue-600 text-xs mt-1">Offer expires {formatDate(pendingOffer.expiryDate)}</p>
                      {pendingOffer.notes && (
                        <p className="text-blue-600 text-xs mt-1 italic">&ldquo;{pendingOffer.notes}&rdquo;</p>
                      )}
                    </div>
                  </div>

                  {renewStep === 0 && (
                    /* Step 0: Initial prompt */
                    <div className="flex gap-2">
                      <button
                        onClick={() => setRenewStep(1)}
                        className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Review Offer
                      </button>
                      <button
                        onClick={() => declineOffer(pendingOffer.id)}
                        disabled={respondingOffer === pendingOffer.id}
                        className="text-blue-600 text-sm hover:underline px-3 disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                  )}

                  {renewStep === 1 && (
                    /* Step 1: Comparison + confirm */
                    <>
                      <div className="bg-white rounded-lg border border-blue-100 mb-3 overflow-hidden">
                        <div className="grid grid-cols-2 divide-x divide-blue-100">
                          <div className="p-3">
                            <p className="text-xs text-gray-500 mb-2 font-medium">Current Terms</p>
                            <div className="space-y-1.5 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-500">Rent</span>
                                <span className="font-medium">{formatCurrency(activeLease.monthlyRent)}/mo</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Ends</span>
                                <span className="font-medium">{formatDate(activeLease.endDate)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="p-3 bg-blue-50">
                            <p className="text-xs text-blue-700 mb-2 font-medium">New Terms</p>
                            <div className="space-y-1.5 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-500">Rent</span>
                                <span className={`font-semibold ${pendingOffer.offeredRent > activeLease.monthlyRent ? 'text-orange-600' : pendingOffer.offeredRent < activeLease.monthlyRent ? 'text-green-600' : 'text-gray-900'}`}>
                                  {formatCurrency(pendingOffer.offeredRent)}/mo
                                  {pendingOffer.offeredRent !== activeLease.monthlyRent && (
                                    <span className="text-xs ml-1">
                                      ({pendingOffer.offeredRent > activeLease.monthlyRent ? '+' : ''}{formatCurrency(pendingOffer.offeredRent - activeLease.monthlyRent)})
                                    </span>
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">New End</span>
                                <span className="font-semibold text-blue-800">
                                  {(() => {
                                    const d = new Date(activeLease.endDate)
                                    d.setMonth(d.getMonth() + pendingOffer.termMonths)
                                    return formatDate(d.toISOString())
                                  })()}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Term</span>
                                <span className="font-medium">{pendingOffer.termMonths} months</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => acceptOffer(pendingOffer.id, activeLease.endDate, pendingOffer.termMonths)}
                          disabled={respondingOffer === pendingOffer.id}
                          className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {respondingOffer === pendingOffer.id ? 'Processing…' : 'Confirm & Accept'}
                        </button>
                        <button
                          onClick={() => setRenewStep(0)}
                          disabled={respondingOffer === pendingOffer.id}
                          className="px-4 py-2 border border-blue-300 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
                        >
                          Go Back
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            /* State B: No pending offer — self-service request */
            activeLease.status === 'ACTIVE' && (
              <div className="mb-5 border border-gray-200 bg-white rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <RefreshCw className="h-4 w-4 text-blue-500" />
                  <h3 className="font-semibold text-gray-900 text-sm">Renew Your Lease</h3>
                </div>

                {/* Expiry warning inside card */}
                {daysLeft !== null && daysLeft <= 60 && (
                  <div className={`mb-4 flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${daysLeft <= 30 ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'}`}>
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    Your lease expires in <strong className="mx-1">{daysLeft} days</strong> on {formatDate(activeLease.endDate)}.
                  </div>
                )}

                {requestSent ? (
                  <div className="flex items-center gap-2 py-2 text-green-700 text-sm">
                    <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-600" />
                    Request sent! Your manager will review and send you a formal offer.
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-gray-500 mb-3">
                      Select a preferred term and send a renewal request to your property manager.
                    </p>
                    <div className="flex gap-2 mb-3">
                      {([6, 12, 24] as const).map(term => (
                        <button
                          key={term}
                          onClick={() => setRequestTerm(term)}
                          className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${requestTerm === term ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:text-blue-700'}`}
                        >
                          {term} months
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={requestNote}
                      onChange={e => setRequestNote(e.target.value)}
                      placeholder="Optional message to your manager…"
                      rows={2}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <button
                      onClick={sendRenewalRequest}
                      disabled={requesting}
                      className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {requesting ? 'Sending…' : 'Send Renewal Request'}
                    </button>
                  </>
                )}
              </div>
            )
          )}

          {/* Current lease details */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-blue-500" /> Property & Unit
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Property</span>
                  <span className="font-medium">{property?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Address</span>
                  <span className="font-medium text-right">{property?.address}, {property?.city}, {property?.state}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Unit</span>
                  <span className="font-medium">{unit?.unitNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Size</span>
                  <span className="font-medium">{unit?.bedrooms} BR / {unit?.bathrooms} BA · {unit?.sqFt?.toLocaleString()} sq ft</span>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-500" /> Lease Terms
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Status</span>
                  <LeaseStatusBadge status={activeLease.status} />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Start Date</span>
                  <span className="font-medium">{formatDate(activeLease.startDate)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">End Date</span>
                  <span className={`font-medium ${daysLeft !== null && daysLeft <= 30 ? 'text-red-600' : ''}`}>
                    {formatDate(activeLease.endDate)}
                    {daysLeft !== null && <span className="text-gray-400 font-normal ml-1">({daysLeft}d)</span>}
                  </span>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <PenTool className="h-4 w-4 text-blue-500" /> Lease Document
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm items-center">
                  <span className="text-gray-500">Tenant Signature</span>
                  {activeLease.tenantSignature ? (
                    <span className="text-emerald-600 font-medium text-xs">Signed</span>
                  ) : (
                    <button onClick={() => setShowSignModal(true)} className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg px-3 py-1.5 font-medium transition-colors">Sign Lease</button>
                  )}
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-gray-500">Manager Signature</span>
                  {activeLease.managerSignature ? (
                    <span className="text-emerald-600 font-medium text-xs">Signed</span>
                  ) : (
                    <span className="text-gray-400 text-xs">Pending</span>
                  )}
                </div>
                <button onClick={handleGeneratePdf} disabled={generatingPdf} className="w-full mt-2 flex items-center justify-center gap-2 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  <Download className="h-4 w-4" />
                  {generatingPdf ? 'Generating…' : 'Download Lease PDF'}
                </button>
              </div>
            </Card>

            <Card>
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-blue-500" /> Financials
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Monthly Rent</span>
                  <span className="font-semibold text-base">{formatCurrency(activeLease.monthlyRent)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Security Deposit</span>
                  <span className="font-medium">{formatCurrency(activeLease.depositAmount)}</span>
                </div>
              </div>
            </Card>

            {tenant && (
              <Card>
                <h3 className="font-semibold text-gray-900 mb-4">Contact Info on File</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Phone</span>
                    <span className="font-medium">{tenant.phone ?? '—'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Emergency Contact</span>
                    <span className="font-medium">{tenant.emergencyContactName ?? '—'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Emergency Phone</span>
                    <span className="font-medium">{tenant.emergencyContactPhone ?? '—'}</span>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Past renewal offers */}
          {pastOffers.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Past Renewal Offers</h3>
              <div className="space-y-2">
                {pastOffers.map((offer: any) => (
                  <div key={offer.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-100 last:border-0">
                    <span className="text-gray-600">{formatCurrency(offer.offeredRent)}/mo · {offer.termMonths}mo term</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${offer.status === 'ACCEPTED' ? 'bg-green-50 text-green-700' : offer.status === 'DECLINED' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{offer.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent ledger */}
          {activeLease.ledgerEntries?.length > 0 && (
            <Card padding="none">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Recent Charges & Payments</h3>
                <Link href="/dashboard/my-payments" className="text-sm text-blue-600 hover:underline">View all</Link>
              </div>
              <Table>
                <TableHead><TableRow><TableHeader>Date</TableHeader><TableHeader>Type</TableHeader><TableHeader>Memo</TableHeader><TableHeader>Amount</TableHeader></TableRow></TableHead>
                <TableBody>
                  {activeLease.ledgerEntries.slice(0, 8).map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-gray-500 text-sm">{formatDate(e.effectiveDate)}</TableCell>
                      <TableCell className="text-gray-600 text-xs">{e.type.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-gray-500 text-sm">{e.memo ?? '—'}</TableCell>
                      <TableCell className={`font-medium ${e.amount >= 0 ? 'text-red-700' : 'text-green-700'}`}>
                        {e.amount >= 0 ? '-' : '+'}{formatCurrency(Math.abs(e.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      {/* Lease history */}
      {leaseHistory?.length > 0 && (
        <Card padding="none" className="mt-6">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Lease History</h3>
          </div>
          <Table>
            <TableHead><TableRow><TableHeader>Property / Unit</TableHeader><TableHeader>Start</TableHeader><TableHeader>End</TableHeader><TableHeader>Rent</TableHeader><TableHeader>Status</TableHeader></TableRow></TableHead>
            <TableBody>
              {leaseHistory.length === 0 && <TableEmptyState message="No previous leases" />}
              {leaseHistory.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell className="text-sm">{l.unit?.property?.name} — Unit {l.unit?.unitNumber}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{formatDate(l.startDate)}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{formatDate(l.endDate)}</TableCell>
                  <TableCell>{formatCurrency(l.monthlyRent)}</TableCell>
                  <TableCell><LeaseStatusBadge status={l.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Modal isOpen={showSignModal} onClose={() => setShowSignModal(false)} title="Sign Lease">
        <SignaturePad
          label="Draw your signature below to sign your lease"
          onSave={handleSignLease}
          onCancel={() => setShowSignModal(false)}
        />
        {signingLease && <p className="text-sm text-gray-400 mt-2 animate-pulse">Saving signature…</p>}
      </Modal>
    </div>
  )
}
