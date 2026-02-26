import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notify'
import { writeAudit } from '@/lib/audit'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole !== 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const lease = await prisma.lease.findUnique({
    where: { id: params.id },
    include: {
      tenant: { include: { user: { select: { id: true } } } },
      unit: {
        include: { property: { select: { id: true, name: true, managerId: true } } },
      },
    },
  })

  if (!lease) return NextResponse.json({ error: 'Lease not found' }, { status: 404 })

  // Verify this lease belongs to the requesting tenant
  if (lease.tenant.user.id !== session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  if (lease.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Can only request renewal for an active lease' }, { status: 400 })
  }

  const body = await req.json()
  const { termMonths, notes } = body

  if (!termMonths || typeof termMonths !== 'number' || termMonths <= 0) {
    return NextResponse.json({ error: 'termMonths is required and must be a positive number' }, { status: 400 })
  }

  const expiryDate = new Date()
  expiryDate.setDate(expiryDate.getDate() + 14)

  const offer = await prisma.leaseRenewalOffer.create({
    data: {
      leaseId: params.id,
      offeredRent: lease.monthlyRent,
      termMonths,
      expiryDate,
      notes: typeof notes === 'string' ? notes : null,
      status: 'PENDING',
    },
  })

  // Notify property manager
  const managerId = lease.unit?.property?.managerId
  const propertyName = lease.unit?.property?.name ?? 'Property'
  if (managerId) {
    await createNotification({
      userId: managerId,
      title: 'Tenant Renewal Request',
      body: `Tenant is requesting a ${termMonths}-month lease renewal for ${propertyName}.`,
      type: 'GENERAL',
      entityType: 'LeaseRenewalOffer',
      entityId: offer.id,
    })
  }

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'LeaseRenewalOffer',
    entityId: offer.id,
    diff: { leaseId: params.id, termMonths, tenantInitiated: true },
  })

  return NextResponse.json(offer, { status: 201 })
}
