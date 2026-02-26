// lib/agent-runtime.ts
// Persistence helpers for AgentRun / AgentStep / AgentActionLog / AgentException.
// All functions are thin wrappers around Prisma — no business logic here.

import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

type JsonInput = Prisma.InputJsonValue

// ── Run lifecycle ─────────────────────────────────────────────────────────────

export async function createRun(opts: {
  triggerType: string
  triggerRef?: string
  propertyId?: string
}): Promise<string> {
  const run = await prisma.agentRun.create({
    data: {
      triggerType: opts.triggerType,
      triggerRef: opts.triggerRef,
      propertyId: opts.propertyId,
      status: 'QUEUED',
    },
    select: { id: true },
  })
  return run.id
}

export async function startRun(runId: string) {
  await prisma.agentRun.update({
    where: { id: runId },
    data: { status: 'RUNNING', startedAt: new Date() },
  })
}

export async function completeRun(runId: string, summary: string) {
  await prisma.agentRun.update({
    where: { id: runId },
    data: { status: 'COMPLETED', completedAt: new Date(), summary },
  })
}

export async function escalateRun(runId: string, summary: string) {
  await prisma.agentRun.update({
    where: { id: runId },
    data: { status: 'ESCALATED', completedAt: new Date(), summary },
  })
}

export async function failRun(runId: string, error: string) {
  await prisma.agentRun.update({
    where: { id: runId },
    data: { status: 'FAILED', completedAt: new Date(), error },
  })
}

// ── Step lifecycle ────────────────────────────────────────────────────────────

export async function addStep(
  runId: string,
  opts: {
    stepOrder: number
    name: string
    inputJson?: Record<string, unknown>
  }
): Promise<string> {
  const step = await prisma.agentStep.create({
    data: {
      runId,
      stepOrder: opts.stepOrder,
      name: opts.name,
      status: 'PLANNED',
      inputJson: opts.inputJson as JsonInput | undefined,
    },
    select: { id: true },
  })
  return step.id
}

export async function startStep(stepId: string) {
  await prisma.agentStep.update({
    where: { id: stepId },
    data: { status: 'RUNNING', startedAt: new Date() },
  })
}

export async function completeStep(stepId: string, outputJson?: Record<string, unknown>) {
  await prisma.agentStep.update({
    where: { id: stepId },
    data: { status: 'DONE', completedAt: new Date(), outputJson: outputJson as JsonInput | undefined },
  })
}

export async function failStep(stepId: string, error: string) {
  await prisma.agentStep.update({
    where: { id: stepId },
    data: { status: 'FAILED', completedAt: new Date(), error },
  })
}

export async function skipStep(stepId: string, reason: string) {
  await prisma.agentStep.update({
    where: { id: stepId },
    data: { status: 'SKIPPED', completedAt: new Date(), error: reason },
  })
}

// ── Action log ────────────────────────────────────────────────────────────────

export async function logAction(opts: {
  runId: string
  stepId?: string
  actionType: 'API_CALL' | 'DECISION' | 'ESCALATION' | 'MEMORY_READ' | 'MEMORY_WRITE'
  target: string
  requestJson?: Record<string, unknown>
  responseJson?: Record<string, unknown>
  policyDecision?: string
  policyReason?: string
}) {
  await prisma.agentActionLog.create({
    data: {
      runId: opts.runId,
      stepId: opts.stepId,
      actionType: opts.actionType,
      target: opts.target,
      requestJson: opts.requestJson as JsonInput | undefined,
      responseJson: opts.responseJson as JsonInput | undefined,
      policyDecision: opts.policyDecision,
      policyReason: opts.policyReason,
    },
  })
}

// ── Exception ─────────────────────────────────────────────────────────────────

export async function createException(opts: {
  runId?: string
  propertyId?: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  category: 'LEGAL' | 'FINANCIAL' | 'SAFETY' | 'SLA' | 'SYSTEM'
  title: string
  details: string
  contextJson?: Record<string, unknown>
  requiresBy?: Date
}): Promise<string> {
  const ex = await prisma.agentException.create({
    data: {
      runId: opts.runId,
      propertyId: opts.propertyId,
      severity: opts.severity,
      category: opts.category,
      title: opts.title,
      details: opts.details,
      contextJson: opts.contextJson as JsonInput | undefined,
      status: 'OPEN',
      requiresBy: opts.requiresBy,
    },
    select: { id: true },
  })
  return ex.id
}

// ── Idempotency ───────────────────────────────────────────────────────────────

export function makeDedupeKey(
  triggerType: string,
  triggerRef: string,
  propertyId: string | null | undefined,
  dateBucket: string
): string {
  return `${triggerType}|${triggerRef}|${propertyId ?? ''}|${dateBucket}`
}

export async function runExistsForKey(dedupeKey: string): Promise<boolean> {
  const existing = await prisma.agentRun.findFirst({
    where: { triggerRef: dedupeKey },
    select: { id: true },
  })
  return !!existing
}

// ── Policy loader ─────────────────────────────────────────────────────────────

import { mergePolicy, DEFAULT_POLICY, type PolicyConfig } from './policy-engine'

/**
 * Load the most specific active policy for a property.
 * Precedence: property > global > default.
 */
export async function loadPolicyForProperty(propertyId: string): Promise<PolicyConfig> {
  const policies = await prisma.agentPolicy.findMany({
    where: {
      isActive: true,
      OR: [
        { scopeType: 'property', scopeId: propertyId },
        { scopeType: 'global' },
      ],
    },
    orderBy: [
      // property-scoped wins
      { scopeType: 'asc' }, // 'global' < 'property' alphabetically — good enough
      { version: 'desc' },
    ],
    take: 2,
  })

  // property-scoped first
  const propertyPolicy = policies.find(
    (p) => p.scopeType === 'property' && p.scopeId === propertyId
  )
  const globalPolicy = policies.find((p) => p.scopeType === 'global')

  const base = globalPolicy ? mergePolicy(globalPolicy.configJson) : DEFAULT_POLICY
  if (propertyPolicy) {
    return mergePolicy({ ...base, ...(propertyPolicy.configJson as object) })
  }
  return base
}
