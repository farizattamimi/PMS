import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AgentActionStatus } from '@prisma/client'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const statusParam = searchParams.get('status')
  const propertyId = searchParams.get('propertyId')

  const validStatuses = Object.values(AgentActionStatus)
  const status =
    statusParam && validStatuses.includes(statusParam as AgentActionStatus)
      ? (statusParam as AgentActionStatus)
      : undefined

  const actions = await prisma.agentAction.findMany({
    where: {
      managerId: session.user.id,
      ...(status && { status }),
      ...(propertyId && { propertyId }),
    },
    include: {
      property: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json(actions)
}
