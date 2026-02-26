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
  const assetId = searchParams.get('assetId')
  const propertyId = searchParams.get('propertyId')

  const propertyFilter = session.user.systemRole === 'MANAGER'
    ? { managerId: session.user.id }
    : {}

  const where: any = {}
  if (assetId) where.assetId = assetId
  if (propertyId) where.asset = { propertyId }
  else if (!assetId) where.asset = { property: propertyFilter }

  const schedules = await prisma.pMSchedule.findMany({
    where,
    include: {
      asset: {
        include: {
          property: { select: { id: true, name: true } },
        },
      },
      vendor: { select: { id: true, name: true } },
    },
    orderBy: { nextDueAt: 'asc' },
  })

  return NextResponse.json(schedules)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { assetId, title, description, frequencyDays, nextDueAt, vendorId, autoCreateWO } = body

  if (!assetId || !title || !frequencyDays || !nextDueAt) {
    return NextResponse.json({ error: 'assetId, title, frequencyDays, nextDueAt required' }, { status: 400 })
  }

  const schedule = await prisma.pMSchedule.create({
    data: {
      assetId,
      title,
      description: description || null,
      frequencyDays: Number(frequencyDays),
      nextDueAt: new Date(nextDueAt),
      vendorId: vendorId || null,
      autoCreateWO: autoCreateWO ?? true,
    },
    include: {
      asset: { include: { property: { select: { id: true, name: true } } } },
      vendor: { select: { id: true, name: true } },
    },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'PMSchedule',
    entityId: schedule.id,
    diff: { assetId, title, frequencyDays },
  })

  return NextResponse.json(schedule, { status: 201 })
}
