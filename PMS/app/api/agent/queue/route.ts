import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sessionProvider } from '@/lib/session-provider'
import { replayDeadLetterRun } from '@/lib/agent-orchestrator'

export async function GET() {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runs = await prisma.agentRun.findMany({
    where: { status: 'ESCALATED' },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, status: true, error: true, summary: true, propertyId: true, createdAt: true },
  })
  const dlq = runs.filter((r) => {
    try {
      const meta = JSON.parse(r.summary ?? '{}') as { dlq?: boolean }
      return !!meta.dlq
    } catch {
      return false
    }
  })
  return NextResponse.json(dlq)
}

export async function POST(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const runId = typeof body.runId === 'string' ? body.runId : ''
  if (!runId) return NextResponse.json({ error: 'runId is required' }, { status: 400 })
  try {
    await replayDeadLetterRun(runId)
    return NextResponse.json({ ok: true, runId })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Replay failed' }, { status: 400 })
  }
}
