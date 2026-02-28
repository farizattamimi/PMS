import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { orgScopeWhere } from '@/lib/access'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const where: any = { ...orgScopeWhere(session) }
  if (status) where.status = status

  const vendors = await prisma.vendor.findMany({
    where,
    include: {
      _count: { select: { workOrders: true } },
      propertyVendors: { include: { property: { select: { id: true, name: true } } } },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(vendors)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, email, phone, serviceCategories } = body

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const vendor = await prisma.vendor.create({
    data: {
      name,
      email: email ?? null,
      phone: phone ?? null,
      serviceCategories: serviceCategories ?? [],
    },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'Vendor',
    entityId: vendor.id,
    diff: { name },
  })

  return NextResponse.json(vendor, { status: 201 })
}
