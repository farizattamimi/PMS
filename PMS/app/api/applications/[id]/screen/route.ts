import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { deliverNotification } from '@/lib/deliver'
import { getScreeningProvider } from '@/lib/screening'
import { screeningCompleteEmail, screeningCompleteSms } from '@/lib/email'
import { assertManagerOwnsProperty } from '@/lib/access'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const application = await prisma.tenantApplication.findUnique({
    where: { id: params.id },
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, monthlyRent: true } },
    },
  })
  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!(await assertManagerOwnsProperty(session, application.propertyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (application.status === 'WITHDRAWN' || application.status === 'DENIED') {
    return NextResponse.json(
      { error: 'Cannot screen a withdrawn or denied application' },
      { status: 400 },
    )
  }

  const provider = getScreeningProvider()
  const desiredRent = application.unit?.monthlyRent ?? undefined

  const result = await provider.runScreening({
    applicationId: application.id,
    firstName: application.firstName,
    lastName: application.lastName,
    email: application.email,
    phone: application.phone ?? undefined,
    currentAddress: application.currentAddress ?? undefined,
    employer: application.employer ?? undefined,
    monthlyIncome: application.monthlyIncome ?? undefined,
    desiredRent,
  })

  const report = await prisma.screeningReport.create({
    data: {
      applicationId: application.id,
      creditScore: result.creditScore,
      creditStatus: result.creditStatus,
      creditNotes: result.creditNotes,
      backgroundStatus: result.backgroundStatus,
      backgroundNotes: result.backgroundNotes,
      evictionStatus: result.evictionStatus,
      evictionNotes: result.evictionNotes,
      incomeVerified: result.incomeVerified,
      incomeRatio: result.incomeRatio,
      incomeStatus: result.incomeStatus,
      incomeNotes: result.incomeNotes,
      overallStatus: result.overallStatus,
      providerRef: result.providerRef,
      rawResponse: result.rawResponse as any,
      requestedById: session.user.id,
      completedAt: new Date(),
    },
  })

  // Auto-advance to UNDER_REVIEW if still SUBMITTED
  if (application.status === 'SUBMITTED') {
    await prisma.tenantApplication.update({
      where: { id: application.id },
      data: { status: 'UNDER_REVIEW' },
    })
  }

  // Notify the requesting manager
  const applicantName = `${application.firstName} ${application.lastName}`
  const propertyName = application.property?.name ?? 'Unknown property'

  await deliverNotification({
    userId: session.user.id,
    title: `Screening complete: ${applicantName}`,
    body: `Overall: ${result.overallStatus}. Credit score: ${result.creditScore}.`,
    type: 'SCREENING_COMPLETE',
    entityType: 'TenantApplication',
    entityId: application.id,
    emailHtml: screeningCompleteEmail(applicantName, propertyName, result.overallStatus, result.creditScore),
    smsBody: screeningCompleteSms(applicantName, propertyName, result.overallStatus),
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'ScreeningReport',
    entityId: report.id,
    diff: { applicationId: application.id, overallStatus: result.overallStatus, creditScore: result.creditScore },
  })

  return NextResponse.json(report, { status: 201 })
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const application = await prisma.tenantApplication.findUnique({
    where: { id: params.id },
    select: { propertyId: true },
  })
  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!(await assertManagerOwnsProperty(session, application.propertyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const reports = await prisma.screeningReport.findMany({
    where: { applicationId: params.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(reports)
}
