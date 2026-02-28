import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deliverNotification } from '@/lib/deliver'
import { writeAudit } from '@/lib/audit'

/**
 * POST /api/notifications/bulk
 *
 * Send an in-app notification to multiple tenants.
 *
 * Body:
 *   propertyId      string   — send to all active tenants of this property
 *   tenantUserIds   string[] — OR send to specific user IDs
 *   title           string   required
 *   body            string   optional
 *   type            string   optional (default: 'BULK_NOTIFY')
 *
 * At least one of `propertyId` or `tenantUserIds` must be provided.
 *
 * Returns { sent: number }
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const {
    propertyId,
    tenantUserIds,
    title,
    body: msgBody,
    type = 'BULK_NOTIFY',
  } = body as {
    propertyId?: string
    tenantUserIds?: string[]
    title: string
    body?: string
    type?: string
  }

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  if (!propertyId && (!tenantUserIds || tenantUserIds.length === 0)) {
    return NextResponse.json(
      { error: 'propertyId or tenantUserIds is required' },
      { status: 400 }
    )
  }

  let targetUserIds: string[] = []

  if (propertyId) {
    // Verify manager access
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        ...(session.user.systemRole === 'MANAGER' ? { managerId: session.user.id } : {}),
      },
      select: { id: true },
    })
    if (!property) {
      return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 })
    }

    // Find all tenants with an active lease on this property
    const leases = await prisma.lease.findMany({
      where: {
        propertyId,
        status: { in: ['ACTIVE', 'DRAFT'] },
      },
      include: {
        tenant: { select: { userId: true } },
      },
    })

    targetUserIds = Array.from(new Set(leases.map(l => l.tenant.userId)))
  } else if (tenantUserIds && tenantUserIds.length > 0) {
    // MANAGER: only allow targeting tenants who have active leases on manager's properties
    if (session.user.systemRole === 'MANAGER') {
      const managedLeases = await prisma.lease.findMany({
        where: {
          status: { in: ['ACTIVE', 'DRAFT'] },
          unit: { property: { managerId: session.user.id } },
          tenant: { userId: { in: tenantUserIds } },
        },
        select: { tenant: { select: { userId: true } } },
      })
      targetUserIds = Array.from(new Set(managedLeases.map(l => l.tenant.userId)))
    } else {
      // ADMIN: verify IDs are actual users
      const users = await prisma.user.findMany({
        where: { id: { in: tenantUserIds } },
        select: { id: true },
      })
      targetUserIds = users.map(u => u.id)
    }
  }

  if (targetUserIds.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  // Send notifications
  await Promise.all(
    targetUserIds.map(userId =>
      deliverNotification({
        userId,
        title,
        body:       msgBody,
        type,
        entityType: propertyId ? 'Property' : undefined,
        entityId:   propertyId,
      })
    )
  )

  await writeAudit({
    actorUserId: session.user.id,
    action:     'CREATE',
    entityType: 'Property',
    entityId:   propertyId ?? 'MULTI',
    diff:       { targetCount: targetUserIds.length, title, type },
  })

  return NextResponse.json({ sent: targetUserIds.length })
}
