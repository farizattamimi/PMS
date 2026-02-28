import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { deliverNotification } from '@/lib/deliver'
import { createOnboardingChecklist } from '@/lib/onboarding'
import { welcomeEmail, welcomeSms } from '@/lib/email'
import { assertManagerOwnsProperty } from '@/lib/access'
import bcrypt from 'bcryptjs'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const application = await prisma.tenantApplication.findUnique({
    where: { id: params.id },
  })
  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!(await assertManagerOwnsProperty(session, application.propertyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (application.status === 'APPROVED') {
    return NextResponse.json({ error: 'Application already approved' }, { status: 400 })
  }

  const body = await req.json()
  const { approvedRent, approvedMoveIn, unitId, createDraftLease, screeningOverride } = body

  if (!approvedRent || !approvedMoveIn) {
    return NextResponse.json({ error: 'approvedRent and approvedMoveIn required' }, { status: 400 })
  }

  const rentNum = Number(approvedRent)
  if (!Number.isFinite(rentNum) || rentNum <= 0 || rentNum > 999999) {
    return NextResponse.json({ error: 'approvedRent must be a positive number up to 999999' }, { status: 400 })
  }

  const moveInDate = new Date(approvedMoveIn)
  if (isNaN(moveInDate.getTime())) {
    return NextResponse.json({ error: 'approvedMoveIn must be a valid date' }, { status: 400 })
  }

  // Screening gate — require screening unless overridden
  if (!screeningOverride) {
    const latestReport = await prisma.screeningReport.findFirst({
      where: { applicationId: params.id },
      orderBy: { createdAt: 'desc' },
      select: { overallStatus: true },
    })
    if (!latestReport) {
      return NextResponse.json(
        { error: 'Screening not run. Set screeningOverride=true to bypass.' },
        { status: 400 },
      )
    }
    if (latestReport.overallStatus === 'FAIL') {
      return NextResponse.json(
        { error: 'Screening failed. Set screeningOverride=true to bypass.' },
        { status: 400 },
      )
    }
  }

  // Create User account
  const passwordHash = await bcrypt.hash('Welcome1!', 10)
  const user = await prisma.user.create({
    data: {
      name: `${application.firstName} ${application.lastName}`,
      email: application.email,
      passwordHash,
      systemRole: 'TENANT',
    },
  })

  // Create Tenant record
  const tenant = await prisma.tenant.create({
    data: {
      userId: user.id,
      phone: application.phone ?? '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      status: 'PROSPECT',
      propertyId: application.propertyId,
    },
  })

  // Update application
  const effectiveUnitId = unitId || application.unitId
  await prisma.tenantApplication.update({
    where: { id: params.id },
    data: {
      status: 'APPROVED',
      tenantId: tenant.id,
      approvedRent: rentNum,
      approvedMoveIn: moveInDate,
      reviewedBy: session.user.id,
      reviewedAt: new Date(),
      unitId: effectiveUnitId || null,
    },
  })

  // Optionally create draft lease
  let leaseId: string | null = null
  if (createDraftLease && effectiveUnitId) {
    const moveIn = new Date(approvedMoveIn)
    const termMonths = application.desiredTerm
    const endDate = new Date(moveIn)
    endDate.setMonth(endDate.getMonth() + termMonths)

    const lease = await prisma.lease.create({
      data: {
        unitId: effectiveUnitId,
        tenantId: tenant.id,
        propertyId: application.propertyId,
        startDate: moveIn,
        endDate,
        monthlyRent: rentNum,
        depositAmount: 0,
        status: 'DRAFT',
      },
    })
    leaseId = lease.id
  }

  // Auto-create onboarding checklist if lease was created
  let onboardingId: string | null = null
  if (leaseId) {
    try {
      const checklist = await createOnboardingChecklist(leaseId)
      onboardingId = checklist.id
    } catch { /* checklist may already exist */ }
  }

  // Send welcome notification + email to new tenant
  const property = await prisma.property.findUnique({ where: { id: application.propertyId }, select: { name: true } })
  const unitInfo = effectiveUnitId ? await prisma.unit.findUnique({ where: { id: effectiveUnitId }, select: { unitNumber: true } }) : null
  await deliverNotification({
    userId: user.id,
    title: `Welcome to ${property?.name ?? 'your new home'}!`,
    body: 'Your tenant account is ready. Please complete your move-in checklist.',
    type: 'GENERAL',
    entityType: 'OnboardingChecklist',
    entityId: onboardingId ?? undefined,
    emailSubject: `Welcome to ${property?.name ?? 'your new home'}!`,
    emailHtml: welcomeEmail(
      `${application.firstName} ${application.lastName}`,
      property?.name ?? 'your property',
      unitInfo?.unitNumber ?? '',
    ),
    smsBody: welcomeSms(
      application.firstName,
      property?.name ?? 'your property',
    ),
  })

  // Notify the manager
  await deliverNotification({
    userId: session.user.id,
    title: `Application approved: ${application.firstName} ${application.lastName}`,
    body: `Tenant account created. ${leaseId ? 'Draft lease ready for review.' : ''}`,
    type: 'GENERAL',
    entityType: 'TenantApplication',
    entityId: params.id,
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'STATUS_CHANGE',
    entityType: 'TenantApplication',
    entityId: params.id,
    diff: { status: 'APPROVED', tenantId: tenant.id, leaseId, ...(screeningOverride ? { screeningOverride: true } : {}) },
  })

  return NextResponse.json({ tenantId: tenant.id, leaseId })
}
