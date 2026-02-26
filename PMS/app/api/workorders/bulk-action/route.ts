import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'

type BulkAction = 'UPDATE_STATUS' | 'UPDATE_PRIORITY' | 'ASSIGN_VENDOR' | 'CANCEL'

/**
 * POST /api/workorders/bulk-action
 *
 * Perform a bulk action on multiple work orders.
 *
 * Body:
 *   ids     string[]    required — IDs of WOs to update
 *   action  BulkAction  required
 *   value   string      required for UPDATE_STATUS, UPDATE_PRIORITY, ASSIGN_VENDOR
 *
 * Returns { updated: number }
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { ids, action, value } = body as {
    ids: string[]
    action: BulkAction
    value?: string
  }

  if (!ids?.length || !action) {
    return NextResponse.json({ error: 'ids and action are required' }, { status: 400 })
  }

  if (action !== 'CANCEL' && !value) {
    return NextResponse.json({ error: 'value is required for this action' }, { status: 400 })
  }

  // Scope to manager's own properties if not ADMIN
  const managerFilter =
    session.user.systemRole === 'MANAGER'
      ? { property: { managerId: session.user.id } }
      : {}

  const updateData: Record<string, unknown> = {}

  switch (action) {
    case 'UPDATE_STATUS':
      updateData.status = value
      if (value === 'COMPLETED') updateData.completedAt = new Date()
      break
    case 'UPDATE_PRIORITY':
      updateData.priority = value
      break
    case 'ASSIGN_VENDOR':
      updateData.assignedVendorId = value || null
      if (value) updateData.status = 'ASSIGNED'
      break
    case 'CANCEL':
      updateData.status = 'CANCELED'
      break
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const result = await prisma.workOrder.updateMany({
    where: {
      id:     { in: ids },
      // Prevent re-canceling already-completed or -canceled WOs unless overriding
      status: action === 'CANCEL' ? { notIn: ['COMPLETED', 'CANCELED'] } : undefined,
      ...managerFilter,
    },
    data: updateData,
  })

  await writeAudit({
    actorUserId: session.user.id,
    action:     action === 'CANCEL' ? 'STATUS_CHANGE' : 'UPDATE',
    entityType: 'WorkOrder',
    entityId:   ids[0],
    diff:       { ids, action, value, updated: result.count },
  })

  return NextResponse.json({ updated: result.count })
}
