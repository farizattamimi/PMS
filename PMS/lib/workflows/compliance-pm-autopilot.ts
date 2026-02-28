// lib/workflows/compliance-pm-autopilot.ts
// Workflow C: Compliance + PM Autopilot
// Trigger: COMPLIANCE_DUE event (fired by /api/cron/compliance-scan daily)
//
// Per-property run that:
//   1. Loads all due/overdue compliance items
//   2. Policy-checks each item (COMPLIANCE_TASK_CREATE)
//   3. ALLOW  → creates a work order + updates item to IN_PROGRESS
//   4. BLOCK  → creates CRITICAL/HIGH exception + notifies manager
//   5. APPROVAL → creates MEDIUM exception + notifies manager with draft WO context
//   6. Checks for any PM schedules that are overdue and not yet WO'd

import { prisma } from '../prisma'
import { deliverNotification } from '../deliver'
import { evaluateAction } from '../policy-engine'
import type { ComplianceCategory, WorkOrderCategory, WorkOrderPriority } from '@prisma/client'
import {
  startRun,
  completeRun,
  escalateRun,
  failRun,
  addStep,
  startStep,
  completeStep,
  failStep,
  logAction,
  createException,
  loadPolicyForProperty,
} from '../agent-runtime'
import { getComplianceSnapshot, setComplianceSnapshot } from '../agent-memory'

interface TriggerData {
  runId: string
  propertyId: string
}

interface ComplianceItemRow {
  id: string
  title: string
  category: ComplianceCategory
  dueDate: Date
  status: string
  notes: string | null
  property: { id: string; name: string; managerId: string }
}

export async function runCompliancePMAutopilot(data: TriggerData): Promise<void> {
  const { runId, propertyId } = data
  let escalated = false

  try {
    await startRun(runId)

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Load context
    // ─────────────────────────────────────────────────────────────────────────
    const s1 = await addStep(runId, {
      stepOrder: 1,
      name: 'Load Compliance Context',
      inputJson: { propertyId },
    })
    await startStep(s1)

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, name: true, managerId: true },
    })
    if (!property) {
      await failStep(s1, `Property ${propertyId} not found`)
      await failRun(runId, `Property ${propertyId} not found`)
      return
    }

    const policy = await loadPolicyForProperty(propertyId)
    const criticalWindow = policy.compliance.criticalDaysBeforeDue

    const now = new Date()
    const cutoff = new Date(now)
    cutoff.setDate(cutoff.getDate() + criticalWindow)

    // Load PENDING and OVERDUE items within the critical window or already overdue
    const items = await prisma.complianceItem.findMany({
      where: {
        propertyId,
        status: { in: ['PENDING', 'OVERDUE'] },
        dueDate: { lte: cutoff },
      },
      include: {
        property: { select: { id: true, name: true, managerId: true } },
      },
      orderBy: { dueDate: 'asc' },
    })

    await completeStep(s1, {
      propertyName: property.name,
      criticalWindowDays: criticalWindow,
      itemsFound: items.length,
    })

    if (items.length === 0) {
      await completeRun(runId, 'No compliance items due within critical window — nothing to process')
      return
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Process each compliance item
    // ─────────────────────────────────────────────────────────────────────────
    const s2 = await addStep(runId, {
      stepOrder: 2,
      name: 'Process Compliance Items',
      inputJson: { itemCount: items.length },
    })
    await startStep(s2)

    let woCreated = 0
    let exceptionsCreated = 0
    let notified = 0

    for (const item of items) {
      const isOverdue = new Date(item.dueDate) < now
      const daysUntilDue = Math.round(
        (new Date(item.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )

      const policyResult = evaluateAction(
        {
          actionType: 'COMPLIANCE_TASK_CREATE',
          context: {
            isOverdue,
            autoCreateTasks: policy.compliance.autoCreateTasks,
          },
        },
        policy
      )

      await logAction({
        runId,
        stepId: s2,
        actionType: 'DECISION',
        target: `compliance:${item.id}`,
        policyDecision: policyResult.decision,
        policyReason: policyResult.reason,
      })

      if (policyResult.decision === 'BLOCK') {
        // Overdue item that must be escalated immediately
        await createException({
          runId,
          propertyId,
          severity: isOverdue ? 'CRITICAL' : 'HIGH',
          category: 'SYSTEM',
          title: isOverdue
            ? `Compliance overdue — ${item.title}`
            : `Critical compliance deadline: ${item.title} (${daysUntilDue}d)`,
          details: policyResult.reason,
          contextJson: {
            itemId: item.id,
            category: item.category,
            dueDate: item.dueDate.toISOString(),
            isOverdue,
            daysUntilDue,
          },
          requiresBy: isOverdue ? new Date(Date.now() + 24 * 60 * 60 * 1000) : new Date(item.dueDate),
        })

        await deliverNotification({
          userId: property.managerId,
          title: isOverdue
            ? `URGENT: Compliance item overdue — ${item.title}`
            : `Compliance deadline critical: ${item.title}`,
          body: `${property.name} · ${item.category.replace(/_/g, ' ')} · Due: ${item.dueDate.toISOString().slice(0, 10)}`,
          type: 'AGENT_ACTION',
          entityType: 'ComplianceItem',
          entityId: item.id,
        })

        exceptionsCreated++
        notified++
        escalated = true
      } else if (policyResult.decision === 'APPROVAL') {
        // autoCreateTasks is disabled — surface as medium exception for manager decision
        await createException({
          runId,
          propertyId,
          severity: 'MEDIUM',
          category: 'SYSTEM',
          title: `Compliance item requires attention: ${item.title}`,
          details: policyResult.reason,
          contextJson: {
            itemId: item.id,
            category: item.category,
            dueDate: item.dueDate.toISOString(),
            isOverdue,
            daysUntilDue,
            suggestedWOTitle: `Compliance: ${item.title}`,
            suggestedPriority: itemPriority(isOverdue, daysUntilDue, criticalWindow),
          },
        })

        await deliverNotification({
          userId: property.managerId,
          title: `Compliance item needs action: ${item.title}`,
          body: `${property.name} · ${daysUntilDue < 0 ? 'Overdue' : `Due in ${daysUntilDue}d`} · Auto-WO creation disabled by policy`,
          type: 'AGENT_ACTION',
          entityType: 'ComplianceItem',
          entityId: item.id,
        })

        exceptionsCreated++
        notified++
        escalated = true
      } else {
        // ALLOW — create work order + update status to IN_PROGRESS
        const category = mapComplianceToWOCategory(item.category)
        const priority = itemPriority(isOverdue, daysUntilDue, criticalWindow)

        try {
          const wo = await prisma.workOrder.create({
            data: {
              propertyId,
              submittedById: property.managerId,
              title: `Compliance: ${item.title}`,
              description: item.notes ?? `Compliance requirement: ${item.title} (${item.category.replace(/_/g, ' ')})`,
              category,
              priority,
              status: 'NEW',
            },
            select: { id: true },
          })

          await prisma.complianceItem.update({
            where: { id: item.id },
            data: { status: 'IN_PROGRESS' },
          })

          await logAction({
            runId,
            stepId: s2,
            actionType: 'API_CALL',
            target: 'prisma.workOrder.create',
            requestJson: { complianceItemId: item.id, category, priority },
            responseJson: { workOrderId: wo.id },
          })

          await deliverNotification({
            userId: property.managerId,
            title: `Agent: Compliance WO created — ${item.title}`,
            body: `${property.name} · WO created (${priority} priority) · Due: ${item.dueDate.toISOString().slice(0, 10)}`,
            type: 'AGENT_ACTION',
            entityType: 'WorkOrder',
            entityId: wo.id,
          })

          woCreated++
          notified++
        } catch (woErr) {
          const msg = woErr instanceof Error ? woErr.message : String(woErr)
          await createException({
            runId,
            propertyId,
            severity: 'HIGH',
            category: 'SYSTEM',
            title: `Failed to create compliance WO: ${item.title}`,
            details: msg,
            contextJson: { itemId: item.id },
          })
          exceptionsCreated++
          escalated = true
        }
      }
    }

    await completeStep(s2, { woCreated, exceptionsCreated, notified })

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: PM schedule overdue audit
    // ─────────────────────────────────────────────────────────────────────────
    const s3 = await addStep(runId, {
      stepOrder: 3,
      name: 'PM Schedule Overdue Audit',
      inputJson: { propertyId },
    })
    await startStep(s3)

    // Find PM schedules overdue by more than one frequency-period — these
    // slipped through the pm-due cron and need escalation.
    const overdueSchedules = await prisma.pMSchedule.findMany({
      where: {
        isActive: true,
        asset: { propertyId },
        nextDueAt: { lte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }, // at least 1 day overdue
      },
      include: {
        asset: { select: { propertyId: true, name: true } },
      },
    })

    let pmEscalated = 0
    for (const sched of overdueSchedules) {
      const daysOverdue = Math.round(
        (now.getTime() - new Date(sched.nextDueAt).getTime()) / (1000 * 60 * 60 * 24)
      )

      // Only escalate if significantly overdue (> frequencyDays * 0.5) to avoid noise
      if (daysOverdue > Math.max(3, sched.frequencyDays * 0.5)) {
        await createException({
          runId,
          propertyId,
          severity: 'MEDIUM',
          category: 'SLA',
          title: `PM schedule overdue: ${sched.title}`,
          details: `PM schedule was due ${daysOverdue} day(s) ago. Asset: ${sched.asset.name}`,
          contextJson: {
            scheduleId: sched.id,
            scheduleTitle: sched.title,
            nextDueAt: sched.nextDueAt.toISOString(),
            daysOverdue,
          },
        })
        pmEscalated++
        escalated = true
      }
    }

    await completeStep(s3, {
      pmSchedulesChecked: overdueSchedules.length,
      pmEscalated,
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Finalize
    // ─────────────────────────────────────────────────────────────────────────
    const summary = `Processed ${items.length} compliance items: ${woCreated} WOs created, ${exceptionsCreated} exceptions, ${pmEscalated} PM alerts`

    // Memory: persist compliance scan snapshot for trend tracking
    const prevSnapshot = await getComplianceSnapshot(propertyId)
    await setComplianceSnapshot(propertyId, {
      lastScanAt: new Date().toISOString(),
      woCreated,
      exceptions: exceptionsCreated + pmEscalated,
      prevExceptionsAllTime: prevSnapshot?.totalExceptionsAllTime ?? 0,
    })

    if (escalated) {
      await escalateRun(runId, summary)
    } else {
      await completeRun(runId, summary)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await failRun(runId, message).catch(() => {})
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mapComplianceToWOCategory(category: ComplianceCategory): WorkOrderCategory {
  switch (category) {
    case 'HVAC_CERT':    return 'HVAC'
    case 'ELECTRICAL':   return 'ELECTRICAL'
    case 'PLUMBING':     return 'PLUMBING'
    default:             return 'GENERAL'
  }
}

function itemPriority(
  isOverdue: boolean,
  daysUntilDue: number,
  criticalWindowDays: number
): WorkOrderPriority {
  if (isOverdue) return 'EMERGENCY'
  if (daysUntilDue <= Math.floor(criticalWindowDays / 2)) return 'HIGH'
  return 'MEDIUM'
}
