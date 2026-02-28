import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { workOrderScopeWhere } from '@/lib/access'

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; costId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cost = await prisma.workOrderCost.findFirst({
    where: {
      id: params.costId,
      workOrderId: params.id,
      workOrder: workOrderScopeWhere(session),
    },
  })
  if (!cost) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const { invoiceNumber, paid, paidAt } = body

  const updateData: any = {}
  if (invoiceNumber !== undefined) updateData.invoiceNumber = invoiceNumber || null
  if (paid !== undefined) updateData.paid = Boolean(paid)
  if (paidAt !== undefined) updateData.paidAt = paidAt ? new Date(paidAt) : null
  // Auto-set paidAt when marking as paid without explicit date
  if (paid === true && !paidAt && !cost.paidAt) {
    updateData.paidAt = new Date()
  }

  const updated = await prisma.workOrderCost.update({
    where: { id: params.costId },
    data: updateData,
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'UPDATE',
    entityType: 'WorkOrderCost',
    entityId: params.costId,
    diff: updateData,
  })

  return NextResponse.json(updated)
}
