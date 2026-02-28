'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft, CreditCard, ExternalLink, Plus } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmptyState } from '@/components/ui/Table'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function MyPaymentsPage() {
  const searchParams = useSearchParams()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showPayModal, setShowPayModal] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMemo, setPayMemo] = useState('')
  const [paying, setPaying] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  async function load() {
    fetch('/api/portal').then(r => r.json()).then(setData).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Handle Stripe redirect query params
  useEffect(() => {
    const paymentStatus = searchParams.get('payment')
    if (paymentStatus === 'success') {
      setSuccessMsg('Payment completed successfully! Your balance will update shortly.')
      // Clean up the URL
      window.history.replaceState({}, '', '/dashboard/my-payments')
      // Refresh data after a moment to pick up the webhook-created entry
      setTimeout(() => load(), 2000)
    } else if (paymentStatus === 'cancelled') {
      setErrorMsg('Payment was cancelled. No charge was made.')
      window.history.replaceState({}, '', '/dashboard/my-payments')
    }
  }, [searchParams])

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    const leaseId = data?.activeLease?.id
    if (!leaseId) return
    setPaying(true)
    setErrorMsg('')

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.abs(parseFloat(payAmount)),
          memo: payMemo || 'Tenant payment',
        }),
      })
      const result = await res.json()

      if (!res.ok) {
        setErrorMsg(result.error || 'Failed to create checkout session')
        setPaying(false)
        return
      }

      // Redirect to Stripe Checkout
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl
        return
      }

      setErrorMsg('No checkout URL returned')
    } catch {
      setErrorMsg('Failed to connect to payment service')
    }
    setPaying(false)
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
    </div>
  )

  const { activeLease, balance } = data ?? {}
  const allLedger: any[] = activeLease?.ledgerEntries ?? []

  // Separate charges (positive amounts = money owed) from payments (negative = paid)
  const charges = allLedger.filter((e: any) => e.amount > 0)
  const payments = allLedger.filter((e: any) => e.amount < 0)

  const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div>
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="h-4 w-4" /> Back to Dashboard
      </Link>
      <PageHeader
        title="My Payments"
        subtitle="Rent charges and payment history"
        action={
          activeLease ? (
            <button
              onClick={() => setShowPayModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              <Plus className="h-4 w-4" /> Make Payment
            </button>
          ) : undefined
        }
      />

      {successMsg && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {errorMsg}
        </div>
      )}

      {!activeLease ? (
        <Card className="text-center py-12">
          <CreditCard className="h-12 w-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500">No active lease found. No payment history available.</p>
        </Card>
      ) : (
        <>
          {/* Balance summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <Card>
              <p className="text-sm text-gray-500 mb-1">Current Balance</p>
              <p className={`text-2xl font-bold ${balance >= 0 ? 'text-red-700' : 'text-green-700'}`}>
                {formatCurrency(Math.abs(balance ?? 0))}
              </p>
              <p className="text-xs text-gray-400">{(balance ?? 0) >= 0 ? 'outstanding' : 'credit'}</p>
            </Card>
            <Card>
              <p className="text-sm text-gray-500 mb-1">Total Charged</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(charges.reduce((s: number, e: any) => s + e.amount, 0))}
              </p>
              <p className="text-xs text-gray-400">{charges.length} charges</p>
            </Card>
            <Card>
              <p className="text-sm text-gray-500 mb-1">Total Paid</p>
              <p className="text-2xl font-bold text-green-700">
                {formatCurrency(Math.abs(payments.reduce((s: number, e: any) => s + e.amount, 0)))}
              </p>
              <p className="text-xs text-gray-400">{payments.length} payments</p>
            </Card>
          </div>

          {/* Full ledger */}
          <Card padding="none">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Transaction History</h3>
            </div>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Date</TableHeader>
                  <TableHeader>Description</TableHeader>
                  <TableHeader>Charge</TableHeader>
                  <TableHeader>Payment</TableHeader>
                  <TableHeader>Balance</TableHeader>
                  <TableHeader>Receipt</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {allLedger.length === 0 && <TableEmptyState message="No transactions yet" />}
                {(() => {
                  let running = 0
                  return [...allLedger].reverse().map((e: any) => {
                    running += e.amount
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="text-gray-500 text-sm">{formatDate(e.effectiveDate)}</TableCell>
                        <TableCell className="text-sm">
                          <span className="text-gray-700">{e.type.replace(/_/g, ' ')}</span>
                          {e.memo && <span className="text-gray-400 ml-1">— {e.memo}</span>}
                        </TableCell>
                        <TableCell className="text-red-700 font-medium text-sm">{e.amount > 0 ? formatCurrency(e.amount) : '—'}</TableCell>
                        <TableCell className="text-green-700 font-medium text-sm">{e.amount < 0 ? formatCurrency(Math.abs(e.amount)) : '—'}</TableCell>
                        <TableCell className={`font-medium text-sm ${running >= 0 ? 'text-red-700' : 'text-green-700'}`}>
                          {formatCurrency(Math.abs(running))} {running >= 0 ? 'owed' : 'credit'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {e.stripeReceiptUrl ? (
                            <a
                              href={e.stripeReceiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                            >
                              Receipt <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })
                })()}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {/* Make payment modal */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Make a Payment</h3>
              <button onClick={() => setShowPayModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handlePay} className="p-6 space-y-4">
              <div>
                <p className="text-sm text-gray-500 mb-3">
                  Suggested amount: <strong>{activeLease ? formatCurrency(activeLease.monthlyRent) : '—'}</strong> (monthly rent)
                </p>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    placeholder={activeLease?.monthlyRent?.toFixed(2)}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
                <input className={INPUT_CLS} value={payMemo} onChange={e => setPayMemo(e.target.value)} placeholder="e.g. March rent" />
              </div>
              <div className="bg-blue-50 text-blue-700 text-xs px-3 py-2 rounded-lg">
                You will be redirected to Stripe to complete your payment securely.
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowPayModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={paying} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">{paying ? 'Redirecting…' : 'Pay with Stripe'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
