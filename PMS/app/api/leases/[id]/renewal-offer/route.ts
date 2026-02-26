import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notify'
import { writeAudit } from '@/lib/audit'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const lease = await prisma.lease.findUnique({
    where: { id: params.id },
    include: {
      tenant: { include: { user: { select: { id: true, name: true } } } },
      unit: { include: { property: { select: { name: true } } } },
    },
  })
  if (!lease) return NextResponse.json({ error: 'Lease not found' }, { status: 404 })

  const body = await req.json()
  const { offeredRent, termMonths, expiryDate, notes } = body

  if (!offeredRent || !termMonths || !expiryDate) {
    return NextResponse.json({ error: 'offeredRent, termMonths, and expiryDate are required' }, { status: 400 })
  }

  const offer = await prisma.leaseRenewalOffer.create({
    data: {
      leaseId: params.id,
      offeredRent: parseFloat(offeredRent),
      termMonths: parseInt(termMonths),
      expiryDate: new Date(expiryDate),
      notes: notes || null,
    },
  })

  // Notify tenant
  await createNotification({
    userId: lease.tenant.user.id,
    title: 'Lease Renewal Offer',
    body: `You have a renewal offer for Unit ${lease.unit?.unitNumber} at ${lease.unit?.property?.name}. New rent: $${offeredRent}/mo for ${termMonths} months. Offer expires ${new Date(expiryDate).toLocaleDateString()}.`,
    type: 'LEASE_EXPIRING',
    entityType: 'LeaseRenewalOffer',
    entityId: offer.id,
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'LeaseRenewalOffer',
    entityId: offer.id,
    diff: { leaseId: params.id, offeredRent, termMonths },
  })

  return NextResponse.json(offer, { status: 201 })
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const offers = await prisma.leaseRenewalOffer.findMany({
    where: { leaseId: params.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(offers)
}
