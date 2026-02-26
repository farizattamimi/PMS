import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { normalizeManagerPropertyIds } from '@/lib/security'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.systemRole !== 'ADMIN' && session.user.id !== params.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, email: true, systemRole: true },
  })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(user)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const existing = await prisma.user.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { name, systemRole, isActive, propertyIds } = body

  const updateData: any = {}
  if (name !== undefined) updateData.name = name
  if (systemRole !== undefined) updateData.systemRole = systemRole
  if (isActive !== undefined) updateData.isActive = isActive

  const user = await prisma.user.update({
    where: { id: params.id },
    data: updateData,
  })

  // Assign selected properties to this manager when requested.
  const effectiveRole = systemRole ?? existing.systemRole
  if (effectiveRole === 'MANAGER' && Array.isArray(propertyIds) && propertyIds.length > 0) {
    const uniquePropertyIds = normalizeManagerPropertyIds(propertyIds)
    if (uniquePropertyIds.length > 0) {
      await prisma.property.updateMany({
        where: { id: { in: uniquePropertyIds } },
        data: { managerId: params.id },
      })
    }
  }

  await writeAudit({
    actorUserId: session.user.id,
    action: isActive === false ? 'STATUS_CHANGE' : 'UPDATE',
    entityType: 'User',
    entityId: params.id,
    diff: { before: { systemRole: existing.systemRole, isActive: existing.isActive }, after: updateData },
  })

  return NextResponse.json(user)
}
