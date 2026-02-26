import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { WorkOrderCategory, WorkOrderPriority, WorkOrderStatus } from '@prisma/client'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')
  const status = searchParams.get('status') as WorkOrderStatus | null
  const category = searchParams.get('category') as WorkOrderCategory | null
  const priority = searchParams.get('priority') as WorkOrderPriority | null

  const where: any = {}
  if (propertyId) where.propertyId = propertyId
  if (status) where.status = status
  if (category) where.category = category
  if (priority) where.priority = priority

  if (session.user.systemRole === 'TENANT') {
    where.submittedById = session.user.id
  } else if (session.user.systemRole === 'MANAGER') {
    where.property = { managerId: session.user.id }
  }

  const workOrders = await prisma.workOrder.findMany({
    where,
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true } },
      submittedBy: { select: { id: true, name: true } },
      assignedVendor: { select: { id: true, name: true } },
      _count: { select: { costs: true } },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json(workOrders)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  let { propertyId, unitId, title, description, category, priority, assignedVendorId, slaDate } = body

  if (!title || !description) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Tenants can only submit for their own unit
  if (session.user.systemRole === 'TENANT') {
    const tenant = await prisma.tenant.findUnique({
      where: { userId: session.user.id },
      include: { leases: { where: { status: 'ACTIVE' }, include: { unit: true }, take: 1 } },
    })
    const activeLease = tenant?.leases[0]
    if (!activeLease) {
      return NextResponse.json({ error: 'No active lease found' }, { status: 403 })
    }
    // Override with values from their actual lease — ignore any client-supplied IDs
    propertyId = activeLease.unit.propertyId
    unitId = activeLease.unitId
  }

  if (!propertyId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const workOrder = await prisma.workOrder.create({
    data: {
      propertyId,
      unitId: unitId ?? null,
      submittedById: session.user.id,
      title,
      description,
      category: category ?? WorkOrderCategory.GENERAL,
      priority: priority ?? WorkOrderPriority.MEDIUM,
      status: WorkOrderStatus.NEW,
      assignedVendorId: assignedVendorId ?? null,
      slaDate: slaDate ? new Date(slaDate) : null,
    },
    include: {
      property: { select: { name: true } },
      submittedBy: { select: { name: true } },
    },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'WorkOrder',
    entityId: workOrder.id,
    diff: { title, status: WorkOrderStatus.NEW },
  })

  return NextResponse.json(workOrder, { status: 201 })
}
