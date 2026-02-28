import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deliverNotification } from '@/lib/deliver'
import { writeAudit } from '@/lib/audit'
import { workOrderScopeWhere } from '@/lib/access'

export async function PATCH(req: Request, { params }: { params: { id: string; bidId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const bid = await prisma.bidRequest.findFirst({
    where: {
      id: params.bidId,
      workOrderId: params.id,
      workOrder: workOrderScopeWhere(session),
    },
    include: {
      workOrder: { include: { property: { select: { name: true, managerId: true } } } },
      vendor: { select: { id: true, name: true } },
    },
  })
  if (!bid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const { status, amount, notes } = body

  const updateData: any = { respondedAt: new Date() }
  if (status) updateData.status = status
  if (amount !== undefined) updateData.amount = amount
  if (notes !== undefined) updateData.notes = notes

  // If manager is accepting this bid, assign vendor to WO and decline others
  if (status === 'ACCEPTED') {
    await prisma.workOrder.update({
      where: { id: params.id },
      data: {
        assignedVendorId: bid.vendorId,
        status: 'ASSIGNED',
      },
    })

    // Decline all other pending bids for this WO
    await prisma.bidRequest.updateMany({
      where: {
        workOrderId: params.id,
        id: { not: params.bidId },
        status: 'PENDING',
      },
      data: { status: 'DECLINED', respondedAt: new Date() },
    })

    // Notify the manager
    await deliverNotification({
      userId: bid.workOrder.property.managerId,
      title: `Bid accepted: ${bid.vendor.name}`,
      body: `Vendor ${bid.vendor.name} accepted for WO: ${bid.workOrder.title}`,
      type: 'GENERAL',
      entityType: 'WorkOrder',
      entityId: params.id,
    })
  }

  const updated = await prisma.bidRequest.update({
    where: { id: params.bidId },
    data: updateData,
    include: { vendor: { select: { id: true, name: true } } },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'UPDATE',
    entityType: 'BidRequest',
    entityId: params.bidId,
    diff: updateData,
  })

  return NextResponse.json(updated)
}
