import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')
  const unitId = searchParams.get('unitId')
  const type = searchParams.get('type')
  const status = searchParams.get('status')

  const propertyFilter = session.user.systemRole === 'MANAGER'
    ? { managerId: session.user.id }
    : {}

  const where: any = {
    property: propertyFilter,
  }
  if (propertyId) where.propertyId = propertyId
  if (unitId) where.unitId = unitId
  if (type) where.type = type
  if (status) where.status = status

  const inspections = await prisma.inspection.findMany({
    where,
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true } },
      _count: { select: { items: true } },
    },
    orderBy: { scheduledAt: 'desc' },
  })

  return NextResponse.json(inspections)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { propertyId, unitId, type, scheduledAt, notes, items } = body

  if (!propertyId || !type || !scheduledAt) {
    return NextResponse.json({ error: 'propertyId, type, scheduledAt required' }, { status: 400 })
  }

  const inspection = await prisma.inspection.create({
    data: {
      propertyId,
      unitId: unitId || null,
      type,
      scheduledAt: new Date(scheduledAt),
      conductedBy: session.user.id,
      notes: notes || null,
      items: items?.length
        ? {
            create: items.map((item: any) => ({
              area: item.area,
              condition: item.condition ?? 'GOOD',
              assetId: item.assetId || null,
              notes: item.notes || null,
            })),
          }
        : undefined,
    },
    include: { items: true },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'Inspection',
    entityId: inspection.id,
    diff: { propertyId, type, scheduledAt },
  })

  return NextResponse.json(inspection, { status: 201 })
}
