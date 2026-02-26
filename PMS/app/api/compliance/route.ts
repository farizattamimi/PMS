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
  const status = searchParams.get('status')
  const category = searchParams.get('category')

  const propertyFilter = session.user.systemRole === 'MANAGER'
    ? { managerId: session.user.id }
    : {}

  const where: any = { property: propertyFilter }
  if (propertyId) where.propertyId = propertyId
  if (status) where.status = status
  if (category) where.category = category

  const items = await prisma.complianceItem.findMany({
    where,
    include: {
      property: { select: { id: true, name: true } },
    },
    orderBy: { dueDate: 'asc' },
  })

  return NextResponse.json(items)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { propertyId, title, category, authority, dueDate, renewalDays, notes } = body

  if (!propertyId || !title || !category || !dueDate) {
    return NextResponse.json({ error: 'propertyId, title, category, dueDate required' }, { status: 400 })
  }

  const item = await prisma.complianceItem.create({
    data: {
      propertyId,
      title,
      category,
      authority: authority || null,
      dueDate: new Date(dueDate),
      renewalDays: renewalDays ? Number(renewalDays) : null,
      notes: notes || null,
    },
    include: { property: { select: { id: true, name: true } } },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'ComplianceItem',
    entityId: item.id,
    diff: { propertyId, title, category, dueDate },
  })

  return NextResponse.json(item, { status: 201 })
}
