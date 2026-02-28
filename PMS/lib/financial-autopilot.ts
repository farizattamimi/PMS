import { createException, completeRun, failRun, startRun } from '@/lib/agent-runtime'
import { prisma } from '@/lib/prisma'

type FinancialRunInput = {
  runId: string
  propertyId: string
  payload: Record<string, unknown>
}

type BankTxn = {
  date: string
  amount: number
  reference?: string
}

export async function runFinancialAutopilot(input: FinancialRunInput) {
  const { runId, propertyId, payload } = input
  try {
    await startRun(runId)
    const txns = (Array.isArray(payload.bankTransactions) ? payload.bankTransactions : []) as BankTxn[]
    const from = typeof payload.from === 'string' ? new Date(payload.from) : new Date(Date.now() - 7 * 86400000)
    const to = typeof payload.to === 'string' ? new Date(payload.to) : new Date()

    const ledger = await prisma.ledgerEntry.findMany({
      where: {
        propertyId,
        effectiveDate: { gte: from, lte: to },
      },
      select: { id: true, amount: true, effectiveDate: true, memo: true },
    })

    const unmatchedBank: BankTxn[] = []
    const unmatchedLedger: string[] = []
    const amountMismatches: Array<{ ledgerId: string; bankAmount: number; ledgerAmount: number }> = []

    const usedLedger = new Set<string>()
    for (const txn of txns) {
      const match = ledger.find((l) => !usedLedger.has(l.id) && Math.abs(Math.abs(l.amount) - Math.abs(txn.amount)) < 0.01)
      if (!match) {
        unmatchedBank.push(txn)
        continue
      }
      usedLedger.add(match.id)
      if (Math.abs(match.amount + txn.amount) > 0.01 && Math.abs(match.amount - txn.amount) > 0.01) {
        amountMismatches.push({ ledgerId: match.id, bankAmount: txn.amount, ledgerAmount: match.amount })
      }
    }
    for (const l of ledger) {
      if (!usedLedger.has(l.id)) unmatchedLedger.push(l.id)
    }

    if (unmatchedBank.length || unmatchedLedger.length || amountMismatches.length) {
      await createException({
        runId,
        propertyId,
        severity: 'HIGH',
        category: 'FINANCIAL',
        title: 'Financial reconciliation exceptions detected',
        details: `unmatchedBank=${unmatchedBank.length}, unmatchedLedger=${unmatchedLedger.length}, mismatches=${amountMismatches.length}`,
        contextJson: { unmatchedBank, unmatchedLedger, amountMismatches, from: from.toISOString(), to: to.toISOString() },
      })
    }

    // Payout approval matrix (configurable via payload)
    const payout = (payload.payoutRequest && typeof payload.payoutRequest === 'object')
      ? (payload.payoutRequest as Record<string, unknown>)
      : null
    const approvalThreshold = Number(payload.payoutApprovalThreshold ?? 5000)
    if (payout) {
      const amount = Number(payout.amount ?? 0)
      const payee = String(payout.payee ?? 'unknown')
      if (!Number.isFinite(amount) || amount <= 0) {
        await createException({
          runId,
          propertyId,
          severity: 'MEDIUM',
          category: 'FINANCIAL',
          title: 'Invalid payout request payload',
          details: 'Payout request amount is invalid',
          contextJson: { payout },
        })
      } else if (amount >= approvalThreshold) {
        await createException({
          runId,
          propertyId,
          severity: 'HIGH',
          category: 'FINANCIAL',
          title: 'Payout requires manager approval',
          details: `Payout $${amount.toFixed(2)} to ${payee} exceeds threshold $${approvalThreshold.toFixed(2)}`,
          contextJson: { payout, approvalThreshold },
        })
      }
    }

    await completeRun(
      runId,
      `Financial autopilot complete: unmatchedBank=${unmatchedBank.length}, unmatchedLedger=${unmatchedLedger.length}, mismatches=${amountMismatches.length}`
    )
  } catch (err: any) {
    await failRun(runId, err?.message ?? 'Financial autopilot failed')
  }
}
