import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { executeAction } from '@/lib/agent'
import { sessionProvider } from '@/lib/session-provider'
import { checkRateLimit, rateLimitHeaders, resolveRateLimitKey } from '@/lib/rate-limit'
import { acquireActionExecutionLock, releaseActionExecutionLock } from '@/lib/action-execution-lock'

const CLAIM_STALE_MS = 2 * 60 * 1000

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const rate = await checkRateLimit({
    bucket: 'agent-inbox-approve',
    key: resolveRateLimitKey(req, session.user.id),
    limit: 30,
    windowMs: 60_000,
  })
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please retry shortly.' },
      { status: 429, headers: rateLimitHeaders(rate) }
    )
  }

  const action = await prisma.agentAction.findUnique({ where: { id: params.id } })
  if (!action) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.systemRole === 'MANAGER' && action.managerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (action.status !== 'PENDING_APPROVAL') {
    return NextResponse.json({ error: `Action is already ${action.status}` }, { status: 409 })
  }

  const actionLock = await acquireActionExecutionLock(params.id)
  if (!actionLock) {
    return NextResponse.json({ error: 'Action is already being handled' }, { status: 409 })
  }

  const now = new Date()
  const staleCutoff = new Date(now.getTime() - CLAIM_STALE_MS)
  try {
    const claim = await prisma.agentAction.updateMany({
      where: {
        id: params.id,
        managerId: session.user.id,
        status: 'PENDING_APPROVAL',
        OR: [{ respondedAt: null }, { respondedAt: { lt: staleCutoff } }],
      },
      data: {
        respondedAt: now,
        result: {
          processing: true,
          claimAt: now.toISOString(),
        } as any,
      },
    })
    if (claim.count !== 1) {
      return NextResponse.json({ error: 'Action is already being handled' }, { status: 409 })
    }

    let execResult: any
    try {
      execResult = await executeAction(action, session.user.id)
    } catch (err: any) {
      execResult = { ok: false, error: err?.message ?? 'Execution failed' }
    }

    const finalized = await prisma.agentAction.updateMany({
      where: {
        id: params.id,
        managerId: session.user.id,
        status: 'PENDING_APPROVAL',
        respondedAt: now,
      },
      data: {
        status: execResult.ok ? 'APPROVED' : 'FAILED',
        result: execResult as any,
        executedAt: new Date(),
      },
    })
    if (finalized.count !== 1) {
      return NextResponse.json({ error: 'Failed to finalize action state safely' }, { status: 409 })
    }

    const updated = await prisma.agentAction.findUnique({ where: { id: params.id } })

    return NextResponse.json(updated, { headers: rateLimitHeaders(rate) })
  } finally {
    await releaseActionExecutionLock(actionLock)
  }
}
