import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { scopedPropertyIdFilter, scopedPropertyIdsForManagerViews } from '@/lib/access'
import { sessionProvider } from '@/lib/session-provider'

/**
 * GET /api/agent/kpis
 *
 * Computes autonomous operations KPIs for the given period.
 * Query params:
 *   days       — lookback window in days (default 30)
 *   propertyId — filter to one property (optional)
 */
export async function GET(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const scopedPropertyIds = await scopedPropertyIdsForManagerViews(session)

  const { searchParams } = new URL(req.url)
  const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '30'), 1), 365)
  const propertyId = searchParams.get('propertyId') ?? undefined

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const runWhere: Record<string, unknown> = { createdAt: { gte: since } }
  const propertyFilter = scopedPropertyIdFilter(scopedPropertyIds, propertyId)
  if (propertyFilter !== undefined) runWhere.propertyId = propertyFilter

  const exWhere: Record<string, unknown> = {}
  if (propertyFilter !== undefined) exWhere.propertyId = propertyFilter

  // ── Run counts by status ─────────────────────────────────────────────────
  const allRuns = await prisma.agentRun.findMany({
    where: runWhere,
    select: { status: true, createdAt: true, triggerRef: true, triggerType: true },
  })

  const statusCounts: Record<string, number> = {}
  for (const r of allRuns) {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1
  }

  const completed  = statusCounts['COMPLETED']  ?? 0
  const escalated  = statusCounts['ESCALATED']  ?? 0
  const failed     = statusCounts['FAILED']     ?? 0
  const running    = statusCounts['RUNNING']    ?? 0
  const queued     = statusCounts['QUEUED']     ?? 0
  const terminal   = completed + escalated + failed
  const total      = allRuns.length

  const autonomousRate = terminal > 0 ? Math.round((completed / terminal) * 100) : null
  const escalationRate = terminal > 0 ? Math.round((escalated / terminal) * 100) : null
  const failureRate    = terminal > 0 ? Math.round((failed    / terminal) * 100) : null

  // ── Workflow type breakdown (inferred from triggerRef) ───────────────────
  const workflowCounts: Record<string, number> = { MAINTENANCE: 0, TENANT_COMMS: 0, COMPLIANCE_PM: 0, OTHER: 0 }
  for (const r of allRuns) {
    const ref = r.triggerRef ?? ''
    if (ref.includes('PM_DUE') || ref.includes('NEW_INCIDENT') || ref.includes('WO_SLA_BREACH')) {
      workflowCounts.MAINTENANCE++
    } else if (ref.includes('NEW_MESSAGE')) {
      workflowCounts.TENANT_COMMS++
    } else if (ref.includes('COMPLIANCE_DUE')) {
      workflowCounts.COMPLIANCE_PM++
    } else {
      workflowCounts.OTHER++
    }
  }

  // ── Trigger type breakdown ───────────────────────────────────────────────
  const triggerCounts: Record<string, number> = {}
  for (const r of allRuns) {
    triggerCounts[r.triggerType] = (triggerCounts[r.triggerType] ?? 0) + 1
  }

  // ── Daily run trend ──────────────────────────────────────────────────────
  const trendMap: Record<string, { date: string; completed: number; escalated: number; failed: number }> = {}
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().slice(0, 10)
    trendMap[key] = { date: key, completed: 0, escalated: 0, failed: 0 }
  }
  for (const r of allRuns) {
    const key = new Date(r.createdAt).toISOString().slice(0, 10)
    if (!trendMap[key]) continue
    if (r.status === 'COMPLETED')  trendMap[key].completed++
    if (r.status === 'ESCALATED')  trendMap[key].escalated++
    if (r.status === 'FAILED')     trendMap[key].failed++
  }
  const dailyTrend = Object.values(trendMap)

  // ── Exception counts ─────────────────────────────────────────────────────
  const openExceptions = await prisma.agentException.findMany({
    where: { ...exWhere, status: { in: ['OPEN', 'ACK'] } },
    select: { severity: true, category: true },
  })

  const openCount    = openExceptions.length
  const criticalOpen = openExceptions.filter(e => e.severity === 'CRITICAL').length

  const exBySeverity: Record<string, number> = {}
  const exByCategory: Record<string, number> = {}
  for (const e of openExceptions) {
    exBySeverity[e.severity] = (exBySeverity[e.severity] ?? 0) + 1
    exByCategory[e.category] = (exByCategory[e.category] ?? 0) + 1
  }

  const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
  const exBySeverityArr = severityOrder
    .filter(s => exBySeverity[s])
    .map(s => ({ severity: s, count: exBySeverity[s] }))

  const exByCategoryArr = Object.entries(exByCategory)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({
    period: { days, since: since.toISOString() },
    runs: {
      total,
      completed,
      escalated,
      failed,
      running,
      queued,
      terminal,
      autonomousRate,
      escalationRate,
      failureRate,
    },
    workflowBreakdown: Object.entries(workflowCounts)
      .filter(([, c]) => c > 0)
      .map(([workflow, count]) => ({ workflow, count })),
    triggerBreakdown: Object.entries(triggerCounts)
      .map(([triggerType, count]) => ({ triggerType, count }))
      .sort((a, b) => b.count - a.count),
    exceptions: {
      openCount,
      criticalOpen,
      bySeverity: exBySeverityArr,
      byCategory: exByCategoryArr,
    },
    dailyTrend,
  })
}
