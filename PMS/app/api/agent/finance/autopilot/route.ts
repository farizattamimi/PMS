import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { enqueueWorkflowRun } from '@/lib/agent-orchestrator'
import { canAccessScopedPropertyId, scopedPropertyIdsForManagerViews } from '@/lib/access'

export async function POST(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const propertyId = typeof body.propertyId === 'string' ? body.propertyId : ''
  if (!propertyId) return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })

  const scopedPropertyIds = await scopedPropertyIdsForManagerViews(session)
  if (!canAccessScopedPropertyId(scopedPropertyIds, propertyId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const runId = await enqueueWorkflowRun({
    workflowType: 'FINANCIAL',
    triggerType: 'manual',
    triggerRef: `financial-${session.user.id}-${Date.now()}`,
    propertyId,
    payload: {
      propertyId,
      bankTransactions: Array.isArray(body.bankTransactions) ? body.bankTransactions : [],
      from: body.from ?? null,
      to: body.to ?? null,
      payoutRequest: body.payoutRequest ?? null,
    },
    maxAttempts: 3,
  })

  return NextResponse.json({ ok: true, runId })
}
