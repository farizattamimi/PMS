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

  const where: any = {}
  if (propertyId) where.propertyId = propertyId
  if (unitId) where.unitId = unitId

  const assets = await prisma.asset.findMany({
    where,
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(assets)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { propertyId, unitId, name, category, brand, modelNumber, serialNumber, installDate, warrantyExpiry, replacementCost, condition, notes } = body

  if (!propertyId || !name || !category) {
    return NextResponse.json({ error: 'propertyId, name, and category are required' }, { status: 400 })
  }

  const asset = await prisma.asset.create({
    data: {
      propertyId,
      unitId: unitId || null,
      name,
      category,
      brand: brand || null,
      modelNumber: modelNumber || null,
      serialNumber: serialNumber || null,
      installDate: installDate ? new Date(installDate) : null,
      warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
      replacementCost: replacementCost ? parseFloat(replacementCost) : null,
      condition: condition || 'GOOD',
      notes: notes || null,
    },
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true } },
    },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'Asset',
    entityId: asset.id,
    diff: { name, category, propertyId },
  })

  return NextResponse.json(asset, { status: 201 })
}
