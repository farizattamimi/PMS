import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { deliverNotification } from '@/lib/deliver'

/**
 * POST /api/workorders/bulk
 *
 * Create one work order per selected unit (or a single property-wide WO if
 * unitIds is empty/omitted).
 *
 * Body:
 *   propertyId   string   required
 *   unitIds      string[] optional (empty = one property-wide WO)
 *   template     {
 *     title        string
 *     description  string
 *     category?    WorkOrderCategory  default GENERAL
 *     priority?    WorkOrderPriority  default MEDIUM
 *     slaDate?     string (ISO)
 *   }
 *
 * Returns { created: number, workOrderIds: string[] }
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { propertyId, unitIds = [], template } = body as {
    propertyId: string
    unitIds?: string[]
    template: {
      title: string
      description: string
      category?: string
      priority?: string
      slaDate?: string
    }
  }

  if (!propertyId || !template?.title || !template?.description) {
    return NextResponse.json(
      { error: 'propertyId, template.title, and template.description are required' },
      { status: 400 }
    )
  }

  // Verify this manager owns the property
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      ...(session.user.systemRole === 'MANAGER' ? { managerId: session.user.id } : {}),
    },
    select: { id: true, name: true, managerId: true },
  })
  if (!property) {
    return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 })
  }

  const base = {
    propertyId,
    submittedById: session.user.id,
    title:       template.title,
    description: template.description,
    category:    (template.category ?? 'GENERAL') as never,
    priority:    (template.priority ?? 'MEDIUM')  as never,
    status:      'NEW' as never,
    slaDate:     template.slaDate ? new Date(template.slaDate) : null,
  }

  const workOrderIds: string[] = []

  if (unitIds.length === 0) {
    // Single property-wide WO
    const wo = await prisma.workOrder.create({ data: base })
    workOrderIds.push(wo.id)
  } else {
    // Verify all unitIds belong to this property
    const validUnits = await prisma.unit.findMany({
      where: { id: { in: unitIds }, propertyId },
      select: { id: true },
    })
    const validIds = new Set(validUnits.map(u => u.id))

    for (const unitId of unitIds) {
      if (!validIds.has(unitId)) continue
      const wo = await prisma.workOrder.create({ data: { ...base, unitId } })
      workOrderIds.push(wo.id)
    }
  }

  // Audit
  await writeAudit({
    actorUserId: session.user.id,
    action:     'CREATE',
    entityType: 'WorkOrder',
    entityId:   propertyId,
    diff:       { count: workOrderIds.length, propertyId, template },
  })

  // Notify manager (if another manager created on their behalf — or self-notify for awareness)
  if (workOrderIds.length > 0) {
    await deliverNotification({
      userId:     property.managerId,
      title:      `${workOrderIds.length} work order${workOrderIds.length !== 1 ? 's' : ''} bulk-created`,
      body:       `"${template.title}" — ${property.name}`,
      type:       'WO_BULK_CREATE',
      entityType: 'Property',
      entityId:   propertyId,
    })
  }

  return NextResponse.json({ created: workOrderIds.length, workOrderIds })
}
