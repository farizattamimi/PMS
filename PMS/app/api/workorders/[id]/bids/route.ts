import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { workOrderScopeWhere } from '@/lib/access'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workOrder = await prisma.workOrder.findFirst({
    where: {
      id: params.id,
      ...workOrderScopeWhere(session),
    },
    select: { id: true },
  })
  if (!workOrder) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const bids = await prisma.bidRequest.findMany({
    where: { workOrderId: params.id },
    include: {
      vendor: { select: { id: true, name: true, email: true, performanceScore: true } },
    },
    orderBy: { sentAt: 'desc' },
  })

  return NextResponse.json(bids)
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const wo = await prisma.workOrder.findFirst({
    where: {
      id: params.id,
      ...workOrderScopeWhere(session),
    },
    include: { property: { select: { name: true } } },
  })
  if (!wo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const vendorIds: string[] = Array.isArray(body.vendorIds) ? body.vendorIds : [body.vendorId]

  if (!vendorIds.length) {
    return NextResponse.json({ error: 'vendorIds required' }, { status: 400 })
  }

  const created = []
  for (const vendorId of vendorIds) {
    // Avoid duplicate pending bid
    const existing = await prisma.bidRequest.findFirst({
      where: { workOrderId: params.id, vendorId, status: 'PENDING' },
    })
    if (existing) continue

    const bid = await prisma.bidRequest.create({
      data: { workOrderId: params.id, vendorId },
      include: { vendor: { select: { id: true, name: true } } },
    })
    created.push(bid)

    // Notify vendor (find user linked to vendor by email if any)
    // For now we notify the manager/admin that the bid was sent
  }

  return NextResponse.json(created, { status: 201 })
}
