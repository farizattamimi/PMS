import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId') ?? ''

  const propertyFilter = propertyId
    ? { id: propertyId }
    : session.user.systemRole === 'MANAGER'
    ? { managerId: session.user.id }
    : {}

  // Renewal offer stats
  const offers = await prisma.leaseRenewalOffer.findMany({
    where: { lease: { property: propertyFilter } },
    select: { id: true, status: true },
  })

  const totalOffers = offers.length
  const accepted = offers.filter(o => o.status === 'ACCEPTED').length
  const declined = offers.filter(o => o.status === 'DECLINED').length
  const expired = offers.filter(o => o.status === 'EXPIRED').length
  const denominator = accepted + declined + expired
  const acceptanceRate = denominator > 0 ? Math.round((accepted / denominator) * 100) : null

  // Pipeline: active leases expiring within 90 days
  const now = new Date()
  const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

  const expiringLeases = await prisma.lease.findMany({
    where: {
      property: propertyFilter,
      status: 'ACTIVE',
      endDate: { lte: in90 },
    },
    include: {
      tenant: { include: { user: { select: { name: true } } } },
      unit: { select: { unitNumber: true } },
      renewalOffers: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { endDate: 'asc' },
  })

  const pipeline = expiringLeases.map(l => {
    const daysLeft = Math.round((new Date(l.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    const latestOffer = l.renewalOffers[0] ?? null
    return {
      leaseId: l.id,
      tenantName: l.tenant?.user?.name ?? 'Unknown',
      unitNumber: l.unit?.unitNumber ?? '?',
      endDate: l.endDate,
      daysLeft,
      offerStatus: latestOffer?.status ?? null,
    }
  })

  return NextResponse.json({
    totalOffers,
    accepted,
    declined,
    expired,
    acceptanceRate,
    pipeline,
  })
}
