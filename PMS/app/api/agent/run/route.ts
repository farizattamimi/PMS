import { NextResponse } from 'next/server'
import { runAgentForManager } from '@/lib/agent'
import { sessionProvider } from '@/lib/session-provider'
import { checkRateLimit, rateLimitHeaders, resolveRateLimitKey } from '@/lib/rate-limit'

export async function POST(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole !== 'MANAGER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const managerId = session.user.id
  const rate = await checkRateLimit({
    bucket: 'agent-run-manual',
    key: resolveRateLimitKey(req, managerId),
    limit: 6,
    windowMs: 60_000,
  })
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please retry shortly.' },
      { status: 429, headers: rateLimitHeaders(rate) }
    )
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  try {
    const result = await runAgentForManager(managerId)
    if (result.alreadyRunning) {
      return NextResponse.json(
        { ok: false, error: 'Agent run already in progress' },
        { status: 409, headers: rateLimitHeaders(rate) }
      )
    }
    if (result.disabled) {
      return NextResponse.json(
        { ok: false, error: 'Agent is disabled for this manager' },
        { status: 409, headers: rateLimitHeaders(rate) }
      )
    }
    if (result.blockedByGovernor) {
      return NextResponse.json(
        { ok: false, error: result.blockReason ?? 'Autonomy blocked by safety governor' },
        { status: 423, headers: rateLimitHeaders(rate) }
      )
    }
    return NextResponse.json({ ok: true, ...result }, { headers: rateLimitHeaders(rate) })
  } catch (err: any) {
    console.error('[agent/run] error:', err)
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Unknown error' },
      { status: 500, headers: rateLimitHeaders(rate) }
    )
  }
}
