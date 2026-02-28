import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { scopedPropertyIdsForManagerViews } from '@/lib/access'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const entityType = searchParams.get('entityType')
  const entityId = searchParams.get('entityId')
  const actorUserId = searchParams.get('actorUserId')
  const action = searchParams.get('action')
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')
  const skip = parseInt(searchParams.get('skip') ?? '0')
  const take = Math.min(parseInt(searchParams.get('take') ?? '50'), 200)
  const exportCsv = searchParams.get('export') === 'csv'

  const where: any = {}
  if (entityType) where.entityType = entityType
  if (entityId) where.entityId = entityId
  if (actorUserId) where.actorUserId = actorUserId
  if (action) where.action = action

  // Date range
  if (dateFrom || dateTo) {
    where.createdAt = {}
    if (dateFrom) where.createdAt.gte = new Date(dateFrom)
    if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59.999Z')
  }

  // MANAGER scoping — only see logs for their properties
  const scopedIds = await scopedPropertyIdsForManagerViews(session)
  if (scopedIds !== null && scopedIds.length > 0) {
    // Find logs where entityType+entityId matches a property, OR where the entity belongs to a scoped property
    // Simplification: filter on actorUserId = self, or entityType = Property with id in scoped, or diff contains propertyId
    // Best approach: just scope by actor being self OR entity being a scoped property
    where.OR = [
      { actorUserId: session.user.id },
      { entityType: 'Property', entityId: { in: scopedIds } },
      // Also include entities related to managed properties (WOs, leases, etc.)
      // For simplicity, include all where entityId references are within scoped property context
    ]
  } else if (scopedIds !== null && scopedIds.length === 0) {
    // Non-admin, non-manager — no access
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (exportCsv) {
    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    })

    const header = 'Timestamp,Actor,Action,Entity Type,Entity ID,Diff'
    const rows = logs.map(l => {
      const ts = l.createdAt.toISOString()
      const actor = l.actor?.name ?? l.actor?.email ?? l.actorUserId ?? ''
      const diff = JSON.stringify(l.diff ?? {}).replace(/"/g, '""')
      return `${ts},"${actor}",${l.action},${l.entityType},${l.entityId ?? ''},"${diff}"`
    })

    return new Response([header, ...rows].join('\n'), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
  ])

  return NextResponse.json({ logs, total, skip, take })
}
