import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')
  const status = searchParams.get('status')

  const where: any = {}
  if (propertyId) where.propertyId = propertyId
  if (status) where.status = status
  if (session.user.systemRole === 'MANAGER') {
    where.property = { managerId: session.user.id }
  }

  const units = await prisma.unit.findMany({
    where,
    include: {
      property: { select: { id: true, name: true } },
      leases: {
        where: { status: 'ACTIVE' },
        include: { tenant: { include: { user: { select: { name: true, email: true } } } } },
        take: 1,
      },
    },
    orderBy: [{ property: { name: 'asc' } }, { unitNumber: 'asc' }],
  })

  return NextResponse.json(units)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { propertyId, unitNumber, bedrooms, bathrooms, sqFt, monthlyRent, marketRent, buildingId } = body

  if (!propertyId || !unitNumber || bedrooms == null || bathrooms == null || !sqFt || !monthlyRent) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const unit = await prisma.unit.create({
    data: {
      propertyId,
      unitNumber,
      bedrooms,
      bathrooms,
      sqFt,
      monthlyRent,
      marketRent: marketRent ?? null,
      buildingId: buildingId ?? null,
      status: 'AVAILABLE',
    },
    include: { property: { select: { name: true } } },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'Unit',
    entityId: unit.id,
    diff: { propertyId, unitNumber },
  })

  return NextResponse.json(unit, { status: 201 })
}
