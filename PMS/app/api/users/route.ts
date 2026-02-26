import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import bcrypt from 'bcryptjs'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      systemRole: true,
      isActive: true,
      createdAt: true,
      managedProperties: { select: { id: true, name: true } },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(users)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, email, password, systemRole, propertyIds } = body

  if (!name || !email || !password || !systemRole) {
    return NextResponse.json({ error: 'name, email, password, systemRole required' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 10)

  const user = await prisma.user.create({
    data: { name, email, passwordHash, systemRole },
  })

  // Assign as manager of selected properties if MANAGER role
  if (systemRole === 'MANAGER' && Array.isArray(propertyIds) && propertyIds.length > 0) {
    await prisma.property.updateMany({
      where: { id: { in: propertyIds } },
      data: { managerId: user.id },
    })
  }

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'User',
    entityId: user.id,
    diff: { name, email, systemRole },
  })

  return NextResponse.json({ id: user.id, name: user.name, email: user.email, systemRole: user.systemRole, isActive: user.isActive, createdAt: user.createdAt }, { status: 201 })
}
