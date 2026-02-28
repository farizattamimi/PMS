import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { deliverNotification } from '@/lib/deliver'
import { renewalOfferEmail, renewalOfferSms } from '@/lib/email'

export async function POST(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const {
    leaseIds,
    rentAdjustmentType,
    rentAdjustmentValue,
    termMonths,
    expiryDays,
    notes,
  } = body as {
    leaseIds: string[]
    rentAdjustmentType: 'pct' | 'flat'
    rentAdjustmentValue: number
    termMonths: number
    expiryDays: number
    notes?: string
  }

  if (!leaseIds?.length || !rentAdjustmentType || rentAdjustmentValue == null || !termMonths || !expiryDays) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (leaseIds.length > 100) {
    return NextResponse.json({ error: 'Maximum 100 leases per bulk renewal' }, { status: 400 })
  }

  if (!['pct', 'flat'].includes(rentAdjustmentType)) {
    return NextResponse.json({ error: 'rentAdjustmentType must be "pct" or "flat"' }, { status: 400 })
  }

  if (typeof rentAdjustmentValue !== 'number' || typeof termMonths !== 'number' || typeof expiryDays !== 'number') {
    return NextResponse.json({ error: 'Numeric fields must be numbers' }, { status: 400 })
  }

  if (termMonths < 1 || termMonths > 120) {
    return NextResponse.json({ error: 'termMonths must be between 1 and 120' }, { status: 400 })
  }

  if (expiryDays < 1 || expiryDays > 90) {
    return NextResponse.json({ error: 'expiryDays must be between 1 and 90' }, { status: 400 })
  }

  const leases = await prisma.lease.findMany({
    where: { id: { in: leaseIds } },
    include: {
      tenant: { include: { user: true } },
      unit: { select: { unitNumber: true } },
      property: { select: { id: true, name: true, managerId: true } },
      renewalOffers: { where: { status: 'PENDING' }, select: { id: true } },
    },
  })

  // Manager scope check
  const isManager = session.user.systemRole === 'MANAGER'

  const sent: string[] = []
  const skipped: { leaseId: string; reason: string }[] = []
  const offerIds: string[] = []

  const expiryDate = new Date()
  expiryDate.setDate(expiryDate.getDate() + expiryDays)

  for (const lease of leases) {
    // Manager can only renew their own properties
    if (isManager && lease.property?.managerId !== session.user.id) {
      skipped.push({ leaseId: lease.id, reason: 'Not your property' })
      continue
    }

    if (lease.status !== 'ACTIVE') {
      skipped.push({ leaseId: lease.id, reason: 'Lease not active' })
      continue
    }

    if (lease.renewalOffers.length > 0) {
      skipped.push({ leaseId: lease.id, reason: 'Already has pending offer' })
      continue
    }

    const offeredRent = rentAdjustmentType === 'pct'
      ? Math.round(lease.monthlyRent * (1 + rentAdjustmentValue / 100) * 100) / 100
      : Math.round((lease.monthlyRent + rentAdjustmentValue) * 100) / 100

    const offer = await prisma.leaseRenewalOffer.create({
      data: {
        leaseId: lease.id,
        offeredRent,
        termMonths,
        expiryDate,
        notes: notes ?? null,
      },
    })

    offerIds.push(offer.id)
    sent.push(lease.id)

    // Notify tenant
    const tenantUser = lease.tenant?.user
    if (tenantUser) {
      await deliverNotification({
        userId: tenantUser.id,
        title: 'Lease Renewal Offer',
        body: `A renewal offer of $${offeredRent.toLocaleString('en-US', { minimumFractionDigits: 2 })}/mo for ${termMonths} months has been sent for your unit at ${lease.property?.name ?? 'your property'}.`,
        type: 'LEASE_RENEWAL',
        entityType: 'LeaseRenewalOffer',
        entityId: offer.id,
        emailSubject: 'Lease Renewal Offer',
        emailHtml: renewalOfferEmail(
          tenantUser.name,
          lease.unit?.unitNumber ?? '',
          lease.property?.name ?? '',
          lease.monthlyRent,
          offeredRent,
          termMonths,
          expiryDate.toLocaleDateString('en-US'),
        ),
        smsBody: renewalOfferSms(
          tenantUser.name,
          lease.property?.name ?? '',
          offeredRent,
          termMonths,
          expiryDate.toLocaleDateString('en-US'),
        ),
      })
    }

    await writeAudit({
      actorUserId: session.user.id,
      action: 'CREATE',
      entityType: 'LeaseRenewalOffer',
      entityId: offer.id,
      diff: { bulkRenewal: true, leaseId: lease.id, offeredRent, termMonths },
    })
  }

  // Handle leaseIds that weren't found in DB
  const foundIds = new Set(leases.map(l => l.id))
  for (const lid of leaseIds) {
    if (!foundIds.has(lid)) {
      skipped.push({ leaseId: lid, reason: 'Lease not found' })
    }
  }

  return NextResponse.json({
    sent: sent.length,
    skipped: skipped.length,
    errors: skipped,
    offerIds,
  })
}
