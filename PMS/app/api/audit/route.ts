import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const entityType = searchParams.get('entityType')
  const entityId = searchParams.get('entityId')
  const take = parseInt(searchParams.get('take') ?? '50')

  const where: any = {}
  if (entityType) where.entityType = entityType
  if (entityId) where.entityId = entityId

  const logs = await prisma.auditLog.findMany({
    where,
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(take, 200),
  })

  return NextResponse.json(logs)
}
