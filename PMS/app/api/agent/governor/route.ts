import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { getGovernorState, setGovernorState } from '@/lib/safety-governor'

export async function GET() {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const state = await getGovernorState()
  return NextResponse.json(state)
}

export async function PATCH(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const patch: any = {}
  if (body.killSwitch !== undefined) patch.killSwitch = !!body.killSwitch
  if (body.reason !== undefined) patch.reason = typeof body.reason === 'string' ? body.reason : null
  if (body.autoPauseMinutes !== undefined) {
    const m = parseInt(String(body.autoPauseMinutes))
    if (Number.isFinite(m) && m > 0) patch.autoPauseUntil = new Date(Date.now() + m * 60 * 1000).toISOString()
    if (m === 0) patch.autoPauseUntil = null
  }
  if (body.failureThresholdPct !== undefined) {
    const v = parseInt(String(body.failureThresholdPct))
    if (Number.isFinite(v) && v >= 1 && v <= 100) patch.failureThresholdPct = v
  }
  if (body.criticalOpenThreshold !== undefined) {
    const v = parseInt(String(body.criticalOpenThreshold))
    if (Number.isFinite(v) && v >= 1) patch.criticalOpenThreshold = v
  }
  if (body.windowHours !== undefined) {
    const v = parseInt(String(body.windowHours))
    if (Number.isFinite(v) && v >= 1 && v <= 168) patch.windowHours = v
  }
  const state = await setGovernorState(patch)
  return NextResponse.json(state)
}
