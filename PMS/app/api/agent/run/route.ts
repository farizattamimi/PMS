import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runAgentForManager } from '@/lib/agent'

export async function POST(req: Request) {
  // Auth: manager session OR Bearer CRON_SECRET
  let managerId: string | null = null

  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Cron/system call — managerId must be in body
    const body = await req.json().catch(() => ({}))
    managerId = body.managerId ?? null
    if (!managerId) {
      return NextResponse.json({ error: 'managerId required for cron/system call' }, { status: 400 })
    }
  } else {
    const session = await getServerSession(authOptions)
    if (!session || session.user.systemRole === 'TENANT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    managerId = session.user.id
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  try {
    const result = await runAgentForManager(managerId)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[agent/run] error:', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 500 })
  }
}
