import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { workOrderScopeWhere } from '@/lib/access'
import { WorkOrderCostType } from '@prisma/client'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
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

  return NextResponse.json(cost, { status: 201 })
}
