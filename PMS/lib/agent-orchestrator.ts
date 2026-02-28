import { prisma } from '@/lib/prisma'
import { createRun } from '@/lib/agent-runtime'
import { runMaintenanceAutopilot } from '@/lib/workflows/maintenance-autopilot'
import { runTenantCommsAutopilot } from '@/lib/workflows/tenant-comms-autopilot'
import { runCompliancePMAutopilot } from '@/lib/workflows/compliance-pm-autopilot'
import { runSLABreachAutopilot } from '@/lib/workflows/sla-breach-autopilot'
import { canExecuteAutonomy } from '@/lib/safety-governor'
import { runFinancialAutopilot } from '@/lib/financial-autopilot'
import { runComplianceLegalAutopilot } from '@/lib/compliance-legal-engine'

export type WorkflowType =
  | 'MAINTENANCE'
  | 'TENANT_COMMS'
  | 'COMPLIANCE_PM'
  | 'SLA_BREACH'
  | 'FINANCIAL'
  | 'COMPLIANCE_LEGAL'

type QueueMeta = {
  workflowType: WorkflowType
  payload: Record<string, unknown>
  attempts: number
  maxAttempts: number
  nextAttemptAt: string
  dlq: boolean
}

function encodeMeta(meta: QueueMeta): string {
  return JSON.stringify(meta)
}

function decodeMeta(summary: string | null): QueueMeta | null {
  if (!summary) return null
  try {
    const parsed = JSON.parse(summary) as QueueMeta
    if (!parsed?.workflowType || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export async function enqueueWorkflowRun(opts: {
  workflowType: WorkflowType
  triggerType: 'event' | 'schedule' | 'manual' | 'inbound'
  triggerRef: string
  propertyId?: string
  payload: Record<string, unknown>
  maxAttempts?: number
}) {
  const runId = await createRun({
    triggerType: opts.triggerType,
    triggerRef: opts.triggerRef,
    propertyId: opts.propertyId,
  })
  const meta: QueueMeta = {
    workflowType: opts.workflowType,
    payload: opts.payload,
    attempts: 0,
    maxAttempts: opts.maxAttempts ?? 3,
    nextAttemptAt: new Date().toISOString(),
    dlq: false,
  }
  await prisma.agentRun.update({
    where: { id: runId },
    data: { summary: encodeMeta(meta), status: 'QUEUED' },
  })
  return runId
}

async function claimNextQueuedRun() {
  const candidates = await prisma.agentRun.findMany({
    where: { status: 'QUEUED' },
    orderBy: { createdAt: 'asc' },
    take: 30,
    select: { id: true, summary: true },
  })

  const now = Date.now()
  for (const c of candidates) {
    const meta = decodeMeta(c.summary)
    if (!meta) continue
    if (new Date(meta.nextAttemptAt).getTime() > now) continue
    const claim = await prisma.agentRun.updateMany({
      where: { id: c.id, status: 'QUEUED' },
      data: { status: 'RUNNING', startedAt: new Date() },
    })
    if (claim.count === 1) {
      const run = await prisma.agentRun.findUnique({ where: { id: c.id } })
      return run
    }
  }
  return null
}

async function markRetry(runId: string, meta: QueueMeta, error: string) {
  const attempts = meta.attempts + 1
  if (attempts >= meta.maxAttempts) {
    const dlqMeta: QueueMeta = {
      ...meta,
      attempts,
      dlq: true,
      nextAttemptAt: new Date().toISOString(),
    }
    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: 'ESCALATED',
        completedAt: new Date(),
        error,
        summary: encodeMeta(dlqMeta),
      },
    })
    return
  }

  const backoffMs = Math.min(5 * 60 * 1000, 15_000 * Math.pow(2, attempts - 1))
  const retryMeta: QueueMeta = {
    ...meta,
    attempts,
    nextAttemptAt: new Date(Date.now() + backoffMs).toISOString(),
  }
  await prisma.agentRun.update({
    where: { id: runId },
    data: { status: 'QUEUED', error, summary: encodeMeta(retryMeta) },
  })
}

async function dispatchRun(run: { id: string; propertyId: string | null; summary: string | null }) {
  const meta = decodeMeta(run.summary)
  if (!meta) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', completedAt: new Date(), error: 'Missing orchestration metadata' },
    })
    return
  }

  const safety = await canExecuteAutonomy()
  if (!safety.ok) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: 'QUEUED', error: safety.reason ?? 'Paused by safety governor' },
    })
    return
  }

  if (run.propertyId) {
    const property = await prisma.property.findUnique({
      where: { id: run.propertyId },
      select: { managerId: true },
    })
    if (property?.managerId) {
      const settings = await prisma.agentSettings.findUnique({
        where: { managerId: property.managerId },
        select: { enabled: true },
      })
      if (!settings?.enabled) {
        await prisma.agentRun.update({
          where: { id: run.id },
          data: { status: 'ESCALATED', completedAt: new Date(), error: 'Agent disabled for manager' },
        })
        return
      }
    }
  }

  try {
    switch (meta.workflowType) {
      case 'MAINTENANCE':
        await runMaintenanceAutopilot({
          runId: run.id,
          propertyId: String(meta.payload.propertyId ?? run.propertyId ?? ''),
          triggerType: String(meta.payload.triggerType ?? 'UNASSIGNED_WO') as any,
          entityId: String(meta.payload.entityId ?? run.id),
        })
        break
      case 'TENANT_COMMS':
        await runTenantCommsAutopilot({
          runId: run.id,
          propertyId: String(meta.payload.propertyId ?? run.propertyId ?? ''),
          threadId: String(meta.payload.threadId ?? ''),
        })
        break
      case 'COMPLIANCE_PM':
        await runCompliancePMAutopilot({
          runId: run.id,
          propertyId: String(meta.payload.propertyId ?? run.propertyId ?? ''),
        })
        break
      case 'SLA_BREACH':
        await runSLABreachAutopilot({
          runId: run.id,
          propertyId: String(meta.payload.propertyId ?? run.propertyId ?? ''),
          workOrderId: String(meta.payload.workOrderId ?? meta.payload.entityId ?? ''),
        })
        break
      case 'FINANCIAL':
        await runFinancialAutopilot({
          runId: run.id,
          propertyId: String(meta.payload.propertyId ?? run.propertyId ?? ''),
          payload: meta.payload,
        })
        break
      case 'COMPLIANCE_LEGAL':
        await runComplianceLegalAutopilot({
          runId: run.id,
          propertyId: String(meta.payload.propertyId ?? run.propertyId ?? ''),
          payload: meta.payload,
        })
        break
      default:
        throw new Error(`Unknown workflowType: ${meta.workflowType}`)
    }
  } catch (err: any) {
    await markRetry(run.id, meta, err?.message ?? 'Workflow execution failed')
  }
}

export async function processQueueBatch(limit = 20) {
  const processed: string[] = []
  for (let i = 0; i < limit; i++) {
    const run = await claimNextQueuedRun()
    if (!run) break
    await dispatchRun(run)
    processed.push(run.id)
  }
  return { processed }
}

export async function replayDeadLetterRun(runId: string) {
  const run = await prisma.agentRun.findUnique({ where: { id: runId } })
  if (!run) throw new Error('Run not found')
  const meta = decodeMeta(run.summary)
  if (!meta || !meta.dlq) throw new Error('Run is not in dead-letter state')
  const replay: QueueMeta = {
    ...meta,
    attempts: 0,
    dlq: false,
    nextAttemptAt: new Date().toISOString(),
  }
  await prisma.agentRun.update({
    where: { id: runId },
    data: { status: 'QUEUED', error: null, completedAt: null, startedAt: null, summary: encodeMeta(replay) },
  })
}
