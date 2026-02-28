import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { orgScopeWhere } from '@/lib/access'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const where = session.user.systemRole === 'MANAGER'
    ? { managerId: session.user.id, ...orgScopeWhere(session) }
    : { ...orgScopeWhere(session) }

  const properties = await prisma.property.findMany({
    where,
    include: {
      manager: { select: { id: true, name: true, email: true } },
      _count: { select: { units: true, workOrders: true } },
      units: { select: { status: true } },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(properties)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, address, city, state, zip, managerId, propertyType, status } = body

  if (!name || !address || !city || !state || !zip) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const units: Array<{ unitNumber: string; buildingName?: string; bedrooms?: number; bathrooms?: number; sqFt?: number; monthlyRent?: number }> = body.units ?? []

  const property = await prisma.property.create({
    data: {
      name,
      address,
      city,
      state,
      zip,
      managerId: managerId ?? session.user.id,
      propertyType: propertyType ?? 'MULTIFAMILY',
      status: status ?? 'ACTIVE',
    },
  })

  // Create buildings + units if provided
  if (units.length > 0) {
    const buildingIdMap = new Map<string, string>()
    for (const unit of units) {
      let buildingId: string | undefined
      if (unit.buildingName) {
        if (!buildingIdMap.has(unit.buildingName)) {
          const building = await prisma.building.create({
            data: { propertyId: property.id, name: unit.buildingName },
          })
          buildingIdMap.set(unit.buildingName, building.id)
        }
        buildingId = buildingIdMap.get(unit.buildingName)
      }
      await prisma.unit.create({
        data: {
          propertyId: property.id,
          buildingId: buildingId ?? null,
          unitNumber: unit.unitNumber,
          bedrooms: unit.bedrooms ?? 1,
          bathrooms: unit.bathrooms ?? 1,
          sqFt: unit.sqFt ?? 750,
          monthlyRent: unit.monthlyRent ?? 1200,
        },
      })
    }
  }

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'Property',
    entityId: property.id,
    diff: { name, status: property.status, unitCount: units.length },
  })

  return NextResponse.json(property, { status: 201 })
}
