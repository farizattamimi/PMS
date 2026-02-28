import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { deliverNotification } from '@/lib/deliver'
import { leaseExpiringEmail, leaseExpiringSms } from '@/lib/email'
import { validateCronSecret } from '@/lib/security'

// Thresholds in days that trigger a notification
const THRESHOLDS = [30, 60, 90]

/**
 * GET /api/cron/lease-expiry
 *
 * Intended to be called by a cron job (e.g. daily at 08:00).
 * Secured by CRON_SECRET env var — pass as ?secret=xxx or Authorization: Bearer xxx.
 *
 * Finds all ACTIVE leases expiring within 90 days and sends a LEASE_EXPIRING
 * notification + email to the tenant once per threshold per lease.
 * Duplicate-prevention: checks whether a notification with the same entityId
 * and threshold marker was already created today.
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
  const in90 = new Date(now)
  in90.setDate(in90.getDate() + 90)

  // Fetch all active leases expiring within 90 days
  const leases = await prisma.lease.findMany({
    where: {
      status: 'ACTIVE',
      endDate: { gte: now, lte: in90 },
    },
    include: {
      tenant: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      unit: {
        include: {
          property: { select: { name: true } },
        },
      },
    },
  })

  let sent = 0
  let skipped = 0
  const todayStr = now.toISOString().slice(0, 10)

  for (const lease of leases) {
    const daysLeft = Math.round((new Date(lease.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    // Find the nearest threshold this lease is at or below
    const threshold = THRESHOLDS.find(t => daysLeft <= t)
    if (!threshold) { skipped++; continue }

    const userId = lease.tenant.user.id
    const markerEntityId = `${lease.id}:expiry:${threshold}d`

    // Check if we already sent this threshold notification today
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        entityId: markerEntityId,
        createdAt: { gte: new Date(todayStr) },
      },
    })
    if (existing) { skipped++; continue }

    const tenantName = lease.tenant.user.name ?? 'Tenant'
    const unitNumber = lease.unit.unitNumber
    const propertyName = lease.unit.property.name
    const endDate = new Date(lease.endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    await deliverNotification({
      userId,
      title: `Lease expiring in ${daysLeft} days`,
      body: `Your lease for Unit ${unitNumber} at ${propertyName} expires on ${endDate}. Contact your property manager about renewal.`,
      type: 'LEASE_EXPIRING',
      entityType: 'Lease',
      entityId: markerEntityId,
      emailSubject: `Reminder: Your lease expires in ${daysLeft} days`,
      emailHtml: leaseExpiringEmail(tenantName, unitNumber, propertyName, endDate, daysLeft),
      smsBody: leaseExpiringSms(tenantName, unitNumber, propertyName, endDate, daysLeft),
    })

    sent++
  }

  // ── Vendor credential expiry check ──
  const in60 = new Date(now)
  in60.setDate(in60.getDate() + 60)

  const vendorsWithExpiringCreds = await prisma.vendor.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { licenseExpiry: { gte: now, lte: in60 } },
        { insuranceExpiry: { gte: now, lte: in60 } },
      ],
      propertyVendors: { some: {} },
    },
    include: {
      propertyVendors: {
        include: {
          property: { select: { managerId: true, name: true } },
        },
      },
    },
  })

  let vendorAlertsSent = 0
  for (const vendor of vendorsWithExpiringCreds) {
    const managerIds = Array.from(new Set(vendor.propertyVendors.map(pv => pv.property.managerId)))
    const alerts: string[] = []
    if (vendor.licenseExpiry && new Date(vendor.licenseExpiry) <= in60) {
      alerts.push(`License expires ${new Date(vendor.licenseExpiry).toLocaleDateString()}`)
    }
    if (vendor.insuranceExpiry && new Date(vendor.insuranceExpiry) <= in60) {
      alerts.push(`Insurance expires ${new Date(vendor.insuranceExpiry).toLocaleDateString()}`)
    }
    const markerEntityId = `vendor:${vendor.id}:creds:${todayStr}`
    for (const managerId of managerIds) {
      const existingAlert = await prisma.notification.findFirst({
        where: { userId: managerId, entityId: markerEntityId, createdAt: { gte: new Date(todayStr) } },
      })
      if (existingAlert) continue
      await deliverNotification({
        userId: managerId,
        title: `Vendor credential expiring: ${vendor.name}`,
        body: alerts.join(' · '),
        type: 'GENERAL',
        entityType: 'Vendor',
        entityId: markerEntityId,
      })
      vendorAlertsSent++
    }
  }

  // ── Compliance overdue / due-soon check ──
  const in30 = new Date(now)
  in30.setDate(in30.getDate() + 30)

  const dueComplianceItems = await prisma.complianceItem.findMany({
    where: {
      status: { in: ['PENDING', 'IN_PROGRESS'] },
      dueDate: { lte: in30 },
    },
    include: {
      property: {
        select: { managerId: true, name: true },
      },
    },
  })

  let complianceAlertsSent = 0
  for (const item of dueComplianceItems) {
    const isOverdue = new Date(item.dueDate) < now
    const daysUntil = Math.round((new Date(item.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    const markerEntityId = `compliance:${item.id}:${todayStr}`

    const existingAlert = await prisma.notification.findFirst({
      where: { userId: item.property.managerId, entityId: markerEntityId, createdAt: { gte: new Date(todayStr) } },
    })
    if (existingAlert) continue

    await deliverNotification({
      userId: item.property.managerId,
      title: isOverdue ? `Compliance overdue: ${item.title}` : `Compliance due in ${daysUntil} days: ${item.title}`,
      body: `${item.property.name} — ${item.category.replace(/_/g, ' ')}`,
      type: 'GENERAL',
      entityType: 'ComplianceItem',
      entityId: markerEntityId,
    })
    complianceAlertsSent++

    // Auto-mark as OVERDUE if past due date
    if (isOverdue && item.status !== 'OVERDUE' as any) {
      await prisma.complianceItem.update({
        where: { id: item.id },
        data: { status: 'OVERDUE' },
      })
    }
  }

  return NextResponse.json({
    ok: true,
    processedLeases: leases.length,
    notificationsSent: sent,
    skipped,
    vendorCredentialAlerts: vendorAlertsSent,
    complianceAlertsSent,
    asOf: now.toISOString(),
  })
}
