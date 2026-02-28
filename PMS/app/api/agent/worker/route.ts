import { NextResponse } from 'next/server'
import { validateCronSecret } from '@/lib/security'
import { processQueueBatch } from '@/lib/agent-orchestrator'
import { evaluateAndAutoPause } from '@/lib/safety-governor'

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const provided = authHeader?.replace('Bearer ', '')
  const auth = validateCronSecret({
    cronSecret: process.env.CRON_SECRET,
    nodeEnv: process.env.NODE_ENV,
    providedSecret: provided,
  })
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const batch = Math.min(Math.max(parseInt(String(body.batch ?? '20')), 1), 100)
  const result = await processQueueBatch(batch)
  const governor = await evaluateAndAutoPause()
  return NextResponse.json({ ok: true, ...result, governor })
}
