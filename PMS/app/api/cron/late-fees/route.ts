import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateCronSecret } from '@/lib/security'
import { writeAudit } from '@/lib/audit'
import { deliverNotification } from '@/lib/deliver'
import { lateFeeEmail, lateFeeSms } from '@/lib/email'

/**
 * GET /api/cron/late-fees
 *
 * Daily cron — assesses late fees for overdue rent.
 * Secured by CRON_SECRET.
 *
 * For each property with lateFeeEnabled, finds ACTIVE leases where:
 *  - today >= 1st of month + gracePeriodDays
 *  - no sufficient RENT payment this month
 *  - no LATE_FEE already charged this month
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const authHeader = req.headers.get('authorization')
  const provided = searchParams.get('secret') ?? authHeader?.replace('Bearer ', '')
  const auth = validateCronSecret({
    cronSecret: process.env.CRON_SECRET,
    nodeEnv: process.env.NODE_ENV,
    providedSecret: provided,
  })
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-indexed
  const dayOfMonth = now.getDate()

  // Start of current month
  const monthStart = new Date(year, month, 1)
  // Start of next month (for upper bound)
  const nextMonthStart = new Date(year, month + 1, 1)

  // Properties with late fees enabled
  const properties = await prisma.property.findMany({
    where: { lateFeeEnabled: true },
    select: {
      id: true,
      name: true,
      lateFeeFlat: true,
      lateFeePct: true,
      gracePeriodDays: true,
    },
  })

  let processed = 0
  let feesCharged = 0
  let skipped = 0

  for (const prop of properties) {
    const graceDays = prop.gracePeriodDays ?? 5

    // Only assess after grace period has passed
    if (dayOfMonth < 1 + graceDays) {
      skipped++
      continue
    }

    // Active leases for this property
    const leases = await prisma.lease.findMany({
      where: {
        unit: { propertyId: prop.id },
        status: 'ACTIVE',
        endDate: { gt: now },
      },
      include: {
        unit: { select: { unitNumber: true } },
        tenant: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    })

    for (const lease of leases) {
      processed++

      // Check if tenant has paid rent this month (negative RENT entry)
      const payments = await prisma.ledgerEntry.aggregate({
        where: {
          leaseId: lease.id,
          type: 'RENT',
          amount: { lt: 0 },
          effectiveDate: { gte: monthStart, lt: nextMonthStart },
        },
        _sum: { amount: true },
      })

      const totalPaid = Math.abs(payments._sum.amount ?? 0)
      if (totalPaid >= lease.monthlyRent) {
        skipped++
        continue
      }

      // Check if LATE_FEE already exists this month (dedup)
      const existingFee = await prisma.ledgerEntry.findFirst({
        where: {
          leaseId: lease.id,
          type: 'LATE_FEE',
          effectiveDate: { gte: monthStart, lt: nextMonthStart },
        },
      })
      if (existingFee) {
        skipped++
        continue
      }

      // Calculate fee amount
      const feeAmount = prop.lateFeeFlat != null
        ? prop.lateFeeFlat
        : ((prop.lateFeePct ?? 5) / 100) * lease.monthlyRent

      if (feeAmount <= 0) {
        skipped++
        continue
      }

      // Create LATE_FEE ledger entry (positive = charge to tenant)
      const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' })
      const entry = await prisma.ledgerEntry.create({
        data: {
          leaseId: lease.id,
          propertyId: prop.id,
          type: 'LATE_FEE',
          amount: feeAmount,
          effectiveDate: now,
          memo: `Late fee — ${monthLabel} rent`,
        },
      })

      await writeAudit({
        actorUserId: undefined,
        action: 'CREATE',
        entityType: 'LedgerEntry',
        entityId: entry.id,
        diff: { type: 'LATE_FEE', amount: feeAmount, leaseId: lease.id },
      })

      const tenantName = lease.tenant.user.name ?? 'Tenant'
      const rentDueDate = new Date(year, month, 1).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })

      await deliverNotification({
        userId: lease.tenant.user.id,
        title: `Late fee charged: $${feeAmount.toFixed(2)}`,
        body: `A late fee has been assessed for Unit ${lease.unit.unitNumber} at ${prop.name}. Rent was due ${rentDueDate}.`,
        type: 'PAYMENT_DUE',
        entityType: 'LedgerEntry',
        entityId: entry.id,
        emailSubject: `Late fee charged — $${feeAmount.toFixed(2)}`,
        emailHtml: lateFeeEmail(tenantName, feeAmount, rentDueDate, lease.unit.unitNumber),
        smsBody: lateFeeSms(tenantName, feeAmount, rentDueDate, lease.unit.unitNumber),
      })

      feesCharged++
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    feesCharged,
    skipped,
    asOf: now.toISOString(),
  })
}
