import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { deliverNotification } from '@/lib/deliver'
import { woStatusEmail, woStatusSms } from '@/lib/email'
import { workOrderScopeWhere } from '@/lib/access'
import { sessionProvider } from '@/lib/session-provider'
import { WorkOrderStatus } from '@prisma/client'

// Valid state transitions for the WorkOrder state machine
const VALID_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  NEW: ['ASSIGNED', 'CANCELED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELED'],
  IN_PROGRESS: ['BLOCKED', 'COMPLETED', 'CANCELED'],
  BLOCKED: ['IN_PROGRESS', 'CANCELED'],
  COMPLETED: [],
  CANCELED: [],
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workOrder = await prisma.workOrder.findFirst({
    where: {
      id: params.id,
      ...workOrderScopeWhere(session),
    },
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true } },
      submittedBy: { select: { id: true, name: true, email: true } },
      assignedVendor: { select: { id: true, name: true, email: true, phone: true } },
      costs: { orderBy: { createdAt: 'asc' } },
      review: true,
    },
  })

  if (!workOrder) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(workOrder)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workOrder = await prisma.workOrder.findFirst({
    where: {
      id: params.id,
      ...workOrderScopeWhere(session),
    },
  })
  if (!workOrder) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { status, assignedVendorId, priority, slaDate, title, description } = body

  // Validate state transition if status is changing
  if (status && status !== workOrder.status) {
    const allowed = VALID_TRANSITIONS[workOrder.status as WorkOrderStatus] ?? []
    if (!allowed.includes(status as WorkOrderStatus)) {
      return NextResponse.json(
        { error: `Invalid transition: ${workOrder.status} → ${status}` },
        { status: 400 }
      )
    }
  }

  const updateData: any = {}
  if (status) updateData.status = status
  if (assignedVendorId !== undefined) updateData.assignedVendorId = assignedVendorId
  if (priority) updateData.priority = priority
  if (slaDate !== undefined) updateData.slaDate = slaDate ? new Date(slaDate) : null
  if (title) updateData.title = title
  if (description) updateData.description = description

  if (status === 'COMPLETED') {
    updateData.completedAt = new Date()
  }

  const updated = await prisma.workOrder.update({
    where: { id: params.id },
    data: updateData,
    include: {
      property: { select: { name: true } },
      assignedVendor: { select: { name: true } },
    },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: status ? 'STATUS_CHANGE' : 'UPDATE',
    entityType: 'WorkOrder',
    entityId: params.id,
    diff: { before: { status: workOrder.status }, after: updateData },
  })

  // Notify submitter on status change (if different user)
  if (status && status !== workOrder.status && workOrder.submittedById !== session.user.id) {
    const propName = updated.property?.name ?? ''
    await deliverNotification({
      userId: workOrder.submittedById,
      title: `Work order "${workOrder.title}" updated`,
      body: `Status changed to ${status.replace('_', ' ')}`,
      type: 'WO_STATUS',
      entityType: 'WorkOrder',
      entityId: params.id,
      emailSubject: `Work order "${workOrder.title}" — ${status.replace('_', ' ')}`,
      emailHtml: woStatusEmail(workOrder.title, status, propName),
      smsBody: woStatusSms(workOrder.title, status, propName),
    })
  }

  return NextResponse.json(updated)
}
