import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { AgentActionStatus } from '@prisma/client'
import { sessionProvider } from '@/lib/session-provider'
import { checkRateLimit, rateLimitHeaders, resolveRateLimitKey } from '@/lib/rate-limit'

export async function GET(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const rate = await checkRateLimit({
    bucket: 'agent-inbox-list',
    key: resolveRateLimitKey(req, session.user.id),
    limit: 120,
    windowMs: 60_000,
  })
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please retry shortly.' },
      { status: 429, headers: rateLimitHeaders(rate) }
    )
  }

  const { searchParams } = new URL(req.url)
  const statusParam = searchParams.get('status')
  const propertyId = searchParams.get('propertyId')

  const validStatuses = Object.values(AgentActionStatus)
  const status =
    statusParam && validStatuses.includes(statusParam as AgentActionStatus)
      ? (statusParam as AgentActionStatus)
      : undefined

  const managerScope = session.user.systemRole === 'MANAGER'
    ? { managerId: session.user.id }
    : {}

  const actions = await prisma.agentAction.findMany({
    where: {
      ...managerScope,
      ...(status && { status }),
      ...(propertyId && { propertyId }),
    },
    include: {
      property: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json(actions, { headers: rateLimitHeaders(rate) })
}
