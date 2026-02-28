import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { workOrderScopeWhere } from '@/lib/access'
import { writeAudit } from '@/lib/audit'
import { WorkOrderCostType } from '@prisma/client'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workOrder = await prisma.workOrder.findFirst({
    where: {
      id: params.id,
      ...workOrderScopeWhere(session),
    },
    select: { id: true },
  })
  if (!workOrder) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const costs = await prisma.workOrderCost.findMany({
    where: { workOrderId: params.id },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(costs)
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
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
  if (!workOrder) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

  const body = await req.json()
  const { costType, amount, memo } = body

  if (!amount) {
    return NextResponse.json({ error: 'Amount is required' }, { status: 400 })
  }

  const cost = await prisma.workOrderCost.create({
    data: {
      workOrderId: params.id,
      costType: costType ?? WorkOrderCostType.OTHER,
      amount: parseFloat(amount),
      memo: memo ?? null,
    },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'WorkOrderCost',
    entityId: cost.id,
    diff: { workOrderId: params.id, costType: costType ?? 'OTHER', amount },
  })

  return NextResponse.json(cost, { status: 201 })
}
