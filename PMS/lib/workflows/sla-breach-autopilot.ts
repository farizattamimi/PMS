// lib/workflows/sla-breach-autopilot.ts
// Workflow D: SLA Breach Autopilot
// Trigger: WO_SLA_BREACH event (fired by /api/cron/sla-scan daily/hourly)
//
// Per-work-order run that:
//   1. Loads the breached WO + property context
//   2. Creates a CRITICAL/HIGH SLA exception and notifies manager
//   3. Attempts to reassign to an alternate vendor (skipping the current one)
//   4. Notifies the tenant that their request is being expedited

import { prisma } from '../prisma'
import { createNotification } from '../notify'
import { evaluateAction } from '../policy-engine'
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
import { getVendorBreachCount, incrementVendorBreachCount } from '../agent-memory'

interface TriggerData {
  runId: string
  propertyId: string
  workOrderId: string
}

export async function runSLABreachAutopilot(data: TriggerData): Promise<void> {
  const { runId, propertyId, workOrderId } = data

  try {
    await startRun(runId)

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Load context
    // ─────────────────────────────────────────────────────────────────────────
    const s1 = await addStep(runId, {
      stepOrder: 1,
      name: 'Load SLA Breach Context',
      inputJson: { workOrderId, propertyId },
    })
    await startStep(s1)

    const wo = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        title: true,
        category: true,
        priority: true,
        status: true,
        slaDate: true,
        assignedVendorId: true,
        unitId: true,
        propertyId: true,
        property: { select: { id: true, name: true, managerId: true } },
      },
    })

    if (!wo) {
      await failStep(s1, `Work order ${workOrderId} not found`)
      await failRun(runId, `Work order ${workOrderId} not found`)
      return
    }

    // WO already closed — nothing to do
    if (wo.status === 'COMPLETED' || wo.status === 'CANCELED') {
      await completeStep(s1, { status: wo.status })
      await completeRun(runId, `WO is already ${wo.status} — no SLA action needed`)
      return
    }

    if (!wo.slaDate) {
      await completeStep(s1, { note: 'no slaDate set' })
      await completeRun(runId, 'Work order has no SLA date — skipping')
      return
    }

    const now = new Date()
    const hoursBreached = Math.round(
      (now.getTime() - new Date(wo.slaDate).getTime()) / (1000 * 60 * 60)
    )
    const policy = await loadPolicyForProperty(propertyId)

    await completeStep(s1, {
      woTitle: wo.title,
      priority: wo.priority,
      status: wo.status,
      hoursBreached,
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Create SLA exception + notify manager
    // ─────────────────────────────────────────────────────────────────────────
    const s2 = await addStep(runId, {
      stepOrder: 2,
      name: 'Escalate SLA Breach',
      inputJson: { priority: wo.priority, hoursBreached },
    })
    await startStep(s2)

    const policyResult = evaluateAction(
      {
        actionType: 'WO_SLA_ESCALATE',
        context: { priority: wo.priority, hoursBreached },
      },
      policy
    )

    await logAction({
      runId,
      stepId: s2,
      actionType: 'DECISION',
      target: `workOrder:${workOrderId}`,
      policyDecision: policyResult.decision,
      policyReason: policyResult.reason,
    })

    const severity =
      wo.priority === 'EMERGENCY' || wo.priority === 'HIGH' ? 'CRITICAL' : 'HIGH'

    await createException({
      runId,
      propertyId,
      severity,
      category: 'SLA',
      title: `SLA breach: ${wo.title} (${hoursBreached}h overdue)`,
      details: `Work order priority: ${wo.priority}. SLA was due ${new Date(wo.slaDate).toISOString().slice(0, 10)}. Current status: ${wo.status}.`,
      contextJson: {
        workOrderId,
        priority: wo.priority,
        status: wo.status,
        slaDate: wo.slaDate.toISOString(),
        hoursBreached,
      },
      requiresBy: new Date(Date.now() + 4 * 60 * 60 * 1000), // respond within 4h
    })

    await createNotification({
      userId: wo.property.managerId,
      title: `SLA breach: ${wo.title}`,
      body: `${wo.property.name} · ${wo.priority} priority · ${hoursBreached}h past SLA deadline · Status: ${wo.status}`,
      type: 'AGENT_ACTION',
      entityType: 'WorkOrder',
      entityId: workOrderId,
    })

    // Memory: increment breach count for the currently assigned vendor
    let vendorBreachCount = 0
    if (wo.assignedVendorId) {
      await incrementVendorBreachCount(wo.assignedVendorId)
      vendorBreachCount = await getVendorBreachCount(wo.assignedVendorId)
      await logAction({
        runId,
        stepId: s2,
        actionType: 'MEMORY_WRITE',
        target: `vendor:${wo.assignedVendorId}:breach_count`,
        responseJson: { breachCount: vendorBreachCount },
      })
    }

    await completeStep(s2, { severity, hoursBreached, exceptionCreated: true, vendorBreachCount })

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Attempt vendor reassignment
    // ─────────────────────────────────────────────────────────────────────────
    const s3 = await addStep(runId, {
      stepOrder: 3,
      name: 'Attempt Vendor Reassignment',
      inputJson: { currentVendorId: wo.assignedVendorId ?? null, category: wo.category },
    })
    await startStep(s3)

    // Find eligible vendors — exclude current assignee
    const vendors = await prisma.vendor.findMany({
      where: {
        status: 'ACTIVE',
        serviceCategories: { has: wo.category },
        propertyVendors: { some: { propertyId } },
        id: wo.assignedVendorId ? { not: wo.assignedVendorId } : undefined,
        licenseExpiry: { gt: now },
      },
      orderBy: { performanceScore: 'desc' },
      take: 5,
      select: { id: true, name: true },
    })

    // Also include vendors without an expiry date
    const vendorsNoExpiry = await prisma.vendor.findMany({
      where: {
        status: 'ACTIVE',
        serviceCategories: { has: wo.category },
        propertyVendors: { some: { propertyId } },
        id: wo.assignedVendorId ? { not: wo.assignedVendorId } : undefined,
        licenseExpiry: null,
      },
      orderBy: { performanceScore: 'desc' },
      take: 5,
      select: { id: true, name: true },
    })

    // Memory: filter out vendors with too many prior SLA breaches (unreliable)
    const MAX_BREACH_THRESHOLD = 3
    const candidatesRaw = [...vendors, ...vendorsNoExpiry]
    const candidates: typeof candidatesRaw = []
    for (const v of candidatesRaw) {
      const breaches = await getVendorBreachCount(v.id)
      if (breaches < MAX_BREACH_THRESHOLD) {
        candidates.push(v)
      } else {
        await logAction({
          runId,
          stepId: s3,
          actionType: 'MEMORY_READ',
          target: `vendor:${v.id}:breach_count`,
          responseJson: { breachCount: breaches, skipped: true, reason: 'exceeds breach threshold' },
        })
      }
    }

    let reassigned = false
    let chosenVendorId: string | null = null

    for (const vendor of candidates) {
      const openCount = await prisma.workOrder.count({
        where: {
          assignedVendorId: vendor.id,
          status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
        },
      })

      const assignResult = evaluateAction(
        {
          actionType: 'WO_ASSIGN_VENDOR',
          context: {
            category: wo.category,
            priority: wo.priority,
            vendorOpenWOCount: openCount,
          },
        },
        policy
      )

      if (assignResult.decision === 'ALLOW') {
        chosenVendorId = vendor.id
        break
      }
    }

    if (chosenVendorId) {
      await prisma.workOrder.update({
        where: { id: workOrderId },
        data: { assignedVendorId: chosenVendorId, status: 'ASSIGNED' },
      })
      await logAction({
        runId,
        stepId: s3,
        actionType: 'API_CALL',
        target: 'prisma.workOrder.update',
        requestJson: { workOrderId, assignedVendorId: chosenVendorId },
        responseJson: { status: 'ASSIGNED' },
      })
      reassigned = true
      await completeStep(s3, { reassigned: true, chosenVendorId })
    } else {
      // No alternate vendor — log but don't fail (exception already created in step 2)
      await logAction({
        runId,
        stepId: s3,
        actionType: 'DECISION',
        target: 'vendor_reassignment',
        policyDecision: 'BLOCK',
        policyReason: candidates.length === 0
          ? 'No alternate vendors available for this property/category'
          : 'All alternate vendors blocked by policy (capacity or priority)',
      })
      await completeStep(s3, { reassigned: false, candidatesChecked: candidates.length })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Notify tenant
    // ─────────────────────────────────────────────────────────────────────────
    const s4 = await addStep(runId, {
      stepOrder: 4,
      name: 'Notify Tenant',
      inputJson: { unitId: wo.unitId ?? null },
    })
    await startStep(s4)

    let tenantNotified = false
    if (wo.unitId) {
      const activeLease = await prisma.lease.findFirst({
        where: {
          unitId: wo.unitId,
          status: { in: ['ACTIVE', 'DRAFT'] },
        },
        select: { tenant: { select: { userId: true } } },
      })

      const tenantUserId = activeLease?.tenant?.userId
      if (tenantUserId) {
        await createNotification({
          userId: tenantUserId,
          title: `Update on your request: ${wo.title}`,
          body: reassigned
            ? 'We\'re expediting your request and have assigned a new vendor. Thank you for your patience.'
            : 'We\'re aware your request is taking longer than expected and our team is working to resolve it.',
          type: 'AGENT_ACTION',
          entityType: 'WorkOrder',
          entityId: workOrderId,
        })
        tenantNotified = true
      }
    }

    await completeStep(s4, { tenantNotified })

    // ─────────────────────────────────────────────────────────────────────────
    // Finalize — always escalated (SLA breach always requires manager awareness)
    // ─────────────────────────────────────────────────────────────────────────
    const summary = `SLA breach: ${wo.title} (${hoursBreached}h overdue · ${wo.priority}). Exception created. ${reassigned ? 'Reassigned to alternate vendor.' : 'No reassignment — manager action required.'}`
    await escalateRun(runId, summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await failRun(runId, message).catch(() => {})
  }
}
