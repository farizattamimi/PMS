import { prisma } from '@/lib/prisma'
import { createException } from '@/lib/agent-runtime'

const SCOPE_TYPE = 'system'
const SCOPE_ID = 'global'
const KEY = 'governor_state'

export type GovernorState = {
  killSwitch: boolean
  autoPauseUntil: string | null
  reason: string | null
  failureThresholdPct: number
  criticalOpenThreshold: number
  windowHours: number
  updatedAt: string
}

const DEFAULT_STATE: GovernorState = {
  killSwitch: false,
  autoPauseUntil: null,
  reason: null,
  failureThresholdPct: 40,
  criticalOpenThreshold: 5,
  windowHours: 6,
  updatedAt: new Date(0).toISOString(),
}

export async function getGovernorState(): Promise<GovernorState> {
  const row = await prisma.agentMemory.findUnique({
    where: { scopeType_scopeId_key: { scopeType: SCOPE_TYPE, scopeId: SCOPE_ID, key: KEY } },
  })
  if (!row?.valueJson || typeof row.valueJson !== 'object') return DEFAULT_STATE
  return { ...DEFAULT_STATE, ...(row.valueJson as Record<string, unknown>) } as GovernorState
}

export async function setGovernorState(patch: Partial<GovernorState>) {
  const current = await getGovernorState()
  const next: GovernorState = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  await prisma.agentMemory.upsert({
    where: { scopeType_scopeId_key: { scopeType: SCOPE_TYPE, scopeId: SCOPE_ID, key: KEY } },
    update: { valueJson: next as any },
    create: { scopeType: SCOPE_TYPE, scopeId: SCOPE_ID, key: KEY, valueJson: next as any, confidence: 1 },
  })
  return next
}

export async function canExecuteAutonomy(): Promise<{ ok: boolean; reason?: string }> {
  const state = await getGovernorState()
  if (state.killSwitch) return { ok: false, reason: state.reason ?? 'Global kill switch enabled' }
  if (state.autoPauseUntil && new Date(state.autoPauseUntil).getTime() > Date.now()) {
    return { ok: false, reason: state.reason ?? `Auto-paused until ${state.autoPauseUntil}` }
  }
  return { ok: true }
}

export async function evaluateAndAutoPause() {
  const state = await getGovernorState()
  const since = new Date(Date.now() - state.windowHours * 60 * 60 * 1000)
  const recentRuns = await prisma.agentRun.findMany({
    where: { createdAt: { gte: since } },
    select: { status: true },
  })
  const terminal = recentRuns.filter((r) => ['COMPLETED', 'FAILED', 'ESCALATED'].includes(r.status)).length
  const failed = recentRuns.filter((r) => r.status === 'FAILED').length
  const failurePct = terminal > 0 ? Math.round((failed / terminal) * 100) : 0

  const criticalOpen = await prisma.agentException.count({
    where: { status: { in: ['OPEN', 'ACK'] }, severity: 'CRITICAL' },
  })

  // Basic policy drift signal: multiple active global policies at once.
  const activeGlobalPolicies = await prisma.agentPolicy.count({
    where: { scopeType: 'global', isActive: true },
  })
  if (activeGlobalPolicies > 1) {
    await createException({
      severity: 'HIGH',
      category: 'SYSTEM',
      title: 'Policy drift detected',
      details: `Detected ${activeGlobalPolicies} active global policies; expected exactly 1.`,
      contextJson: { activeGlobalPolicies },
    })
  }

  if (failurePct >= state.failureThresholdPct || criticalOpen >= state.criticalOpenThreshold) {
    const until = new Date(Date.now() + 60 * 60 * 1000)
    const reason = `Auto-paused: failurePct=${failurePct} criticalOpen=${criticalOpen}`
    await setGovernorState({ autoPauseUntil: until.toISOString(), reason })
    await createException({
      severity: 'CRITICAL',
      category: 'SYSTEM',
      title: 'Autonomy auto-paused by safety governor',
      details: reason,
      contextJson: { failurePct, criticalOpen, thresholdFailurePct: state.failureThresholdPct, thresholdCriticalOpen: state.criticalOpenThreshold },
    })
    return { paused: true, reason, until: until.toISOString() }
  }
  return { paused: false, failurePct, criticalOpen }
}
