import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { deliverNotification } from '@/lib/deliver'
import { writeAudit } from '@/lib/audit'

export async function PATCH(req: Request, { params }: { params: { id: string; offerId: string } }) {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const offer = await prisma.leaseRenewalOffer.findUnique({
    where: { id: params.offerId },
    include: {
      lease: {
        include: {
          tenant: { include: { user: { select: { id: true } } } },
          unit: {
            include: { property: { select: { id: true, name: true, managerId: true } } },
          },
        },
      },
    },
  })

  if (!offer || offer.leaseId !== params.id) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  }

  // Tenants can only accept/decline their own offers
  if (session.user.systemRole === 'TENANT') {
    const tenantUserId = offer.lease.tenant.user.id
    if (session.user.id !== tenantUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
  }

  const body = await req.json()
  const { status } = body

  if (!['ACCEPTED', 'DECLINED', 'EXPIRED'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const updated = await prisma.leaseRenewalOffer.update({
    where: { id: params.offerId },
    data: { status, respondedAt: new Date() },
  })

  // If accepted, extend the lease
  if (status === 'ACCEPTED') {
    const newEndDate = new Date(offer.lease.endDate)
    newEndDate.setMonth(newEndDate.getMonth() + offer.termMonths)
    await prisma.lease.update({
      where: { id: params.id },
      data: { endDate: newEndDate, monthlyRent: offer.offeredRent },
    })
  }

  // Notify manager when tenant responds
  if (session.user.systemRole === 'TENANT') {
    const managerId = offer.lease.unit?.property?.managerId
    const propertyName = offer.lease.unit?.property?.name ?? 'Property'
    if (managerId) {
      let notifBody: string
      if (status === 'ACCEPTED') {
        const newEndDate = new Date(offer.lease.endDate)
        newEndDate.setMonth(newEndDate.getMonth() + offer.termMonths)
        notifBody = `Tenant accepted the renewal offer for ${propertyName}. Lease extended to ${newEndDate.toLocaleDateString()}.`
      } else {
        notifBody = `Tenant declined the renewal offer for ${propertyName}.`
      }
      await deliverNotification({
        userId: managerId,
        title: `Renewal offer ${status.toLowerCase()}`,
        body: notifBody,
        type: 'GENERAL',
        entityType: 'LeaseRenewalOffer',
        entityId: params.offerId,
      })
    }
  }

  await writeAudit({
    actorUserId: session.user.id,
    action: 'STATUS_CHANGE',
    entityType: 'LeaseRenewalOffer',
    entityId: params.offerId,
    diff: { status },
  })

  return NextResponse.json(updated)
}
