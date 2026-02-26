import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { createNotification } from '@/lib/notify'
import bcrypt from 'bcryptjs'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const application = await prisma.tenantApplication.findUnique({
    where: { id: params.id },
  })
  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (application.status === 'APPROVED') {
    return NextResponse.json({ error: 'Application already approved' }, { status: 400 })
  }

  const body = await req.json()
  const { approvedRent, approvedMoveIn, unitId, createDraftLease } = body

  if (!approvedRent || !approvedMoveIn) {
    return NextResponse.json({ error: 'approvedRent and approvedMoveIn required' }, { status: 400 })
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
      approvedRent: Number(approvedRent),
      approvedMoveIn: new Date(approvedMoveIn),
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
        monthlyRent: Number(approvedRent),
        depositAmount: 0,
        status: 'DRAFT',
      },
    })
    leaseId = lease.id
  }

  // Notify the manager
  await createNotification({
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
    diff: { status: 'APPROVED', tenantId: tenant.id, leaseId },
  })

  return NextResponse.json({ tenantId: tenant.id, leaseId })
}
