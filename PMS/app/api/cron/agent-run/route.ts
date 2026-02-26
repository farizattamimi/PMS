import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateCronSecret } from '@/lib/security'
import { runAgentForManager } from '@/lib/agent'

/**
 * GET /api/cron/agent-run
 *
 * Intended to be called by a cron job (e.g. hourly).
 * Secured by CRON_SECRET env var — pass as ?secret=xxx or Authorization: Bearer xxx.
 *
 * Finds all managers with agentSettings.enabled=true and runs the agent for each.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const authHeader = req.headers.get('authorization')
  const provided = searchParams.get('secret') ?? authHeader?.replace('Bearer ', '')
  const auth = validateCronSecret({
    cronSecret: process.env.CRON_SECRET,
    nodeEnv: process.env.NODE_ENV,
    providedSecret: provided,
  })
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  const enabledSettings = await prisma.agentSettings.findMany({
    where: { enabled: true },
    select: { managerId: true },
  })

  const results = []
  for (const s of enabledSettings) {
    try {
      const result = await runAgentForManager(s.managerId)
      results.push({ managerId: s.managerId, ok: true, ...result })
    } catch (err: any) {
      results.push({ managerId: s.managerId, ok: false, error: err?.message ?? 'Unknown error' })
    }
  }

  return NextResponse.json({ ran: results.length, results })
}
