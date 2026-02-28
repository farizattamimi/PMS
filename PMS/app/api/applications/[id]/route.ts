import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { assertManagerOwnsProperty } from '@/lib/access'

const VALID_APP_STATUSES = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'DENIED', 'WITHDRAWN']

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const application = await prisma.tenantApplication.findUnique({
    where: { id: params.id },
    include: {
      property: { select: { id: true, name: true, managerId: true } },
      unit: { select: { id: true, unitNumber: true, monthlyRent: true } },
      tenant: { select: { id: true } },
      screeningReports: {
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        select: {
          id: true, overallStatus: true, creditScore: true, creditStatus: true,
          creditNotes: true, backgroundStatus: true, backgroundNotes: true,
          evictionStatus: true, evictionNotes: true, incomeStatus: true,
          incomeNotes: true, incomeRatio: true, incomeVerified: true, completedAt: true,
        },
      },
    },
  })

  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!(await assertManagerOwnsProperty(session, application.propertyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(application)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const application = await prisma.tenantApplication.findUnique({ where: { id: params.id } })
  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!(await assertManagerOwnsProperty(session, application.propertyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { status, reviewNotes, approvedRent, approvedMoveIn, unitId } = body

  if (status !== undefined && !VALID_APP_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_APP_STATUSES.join(', ')}` }, { status: 400 })
  }

  const data: any = {}
  if (status !== undefined) {
    data.status = status
    data.reviewedBy = session.user.id
    data.reviewedAt = new Date()
  }
  if (reviewNotes !== undefined) data.reviewNotes = reviewNotes
  if (approvedRent !== undefined) data.approvedRent = Number(approvedRent)
  if (approvedMoveIn !== undefined) data.approvedMoveIn = new Date(approvedMoveIn)
  if (unitId !== undefined) data.unitId = unitId || null

  const updated = await prisma.tenantApplication.update({
    where: { id: params.id },
    data,
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true, monthlyRent: true } },
      tenant: { select: { id: true } },
      screeningReports: {
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        select: {
          id: true, overallStatus: true, creditScore: true, creditStatus: true,
          creditNotes: true, backgroundStatus: true, backgroundNotes: true,
          evictionStatus: true, evictionNotes: true, incomeStatus: true,
          incomeNotes: true, incomeRatio: true, incomeVerified: true, completedAt: true,
        },
      },
    },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'UPDATE',
    entityType: 'TenantApplication',
    entityId: params.id,
    diff: data,
  })

  return NextResponse.json(updated)
}
