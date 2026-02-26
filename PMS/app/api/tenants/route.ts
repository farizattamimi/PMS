import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenants = await prisma.tenant.findMany({
    include: {
      user: { select: { id: true, name: true, email: true } },
      leases: {
        orderBy: { startDate: 'desc' },
        take: 1,
        include: {
          unit: { include: { property: { select: { name: true } } } },
        },
      },
    },
    orderBy: { user: { name: 'asc' } },
  })

  return NextResponse.json(tenants)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { userId, phone, emergencyContactName, emergencyContactPhone, status } = body

  const tenant = await prisma.tenant.create({
    data: {
      userId,
      phone,
      emergencyContactName,
      emergencyContactPhone,
      status: status ?? 'PROSPECT',
    },
    include: { user: { select: { name: true, email: true } } },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'Tenant',
    entityId: tenant.id,
    diff: { userId, status: tenant.status },
  })

  return NextResponse.json(tenant, { status: 201 })
}
