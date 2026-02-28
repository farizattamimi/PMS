// lib/workflows/maintenance-autopilot.ts
// Workflow A: Maintenance Autopilot
// Trigger: PM due, new incident, or unassigned work order

import { prisma } from '../prisma'
import { deliverNotification } from '../deliver'
import { evaluateAction, type PolicyConfig } from '../policy-engine'
import type { WorkOrderCategory } from '@prisma/client'
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
import { getPreferredVendor, setPreferredVendor } from '../agent-memory'

interface TriggerData {
  runId: string
  propertyId: string
  triggerType: 'PM_DUE' | 'NEW_INCIDENT' | 'UNASSIGNED_WO'
  entityId: string
}

interface RunContext {
  runId: string
  propertyId: string
  policy: PolicyConfig
  managerId: string
}

export async function runMaintenanceAutopilot(data: TriggerData): Promise<void> {
  const { runId, propertyId } = data
  let escalated = false

  try {
    await startRun(runId)

    // Load property for managerId
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, name: true, managerId: true },
    })
    if (!property) {
      await failRun(runId, `Property ${propertyId} not found`)
      return
    }

    const policy = await loadPolicyForProperty(propertyId)
    const ctx: RunContext = {
      runId,
      propertyId,
      policy,
      managerId: property.managerId,
    }

    if (data.triggerType === 'PM_DUE') {
      escalated = await handlePMDue(ctx, data.entityId)
    } else if (data.triggerType === 'NEW_INCIDENT') {
      escalated = await handleIncident(ctx, data.entityId)
    } else if (data.triggerType === 'UNASSIGNED_WO') {
      escalated = await handleUnassignedWO(ctx, data.entityId)
    }

    if (escalated) {
      await escalateRun(runId, 'Workflow completed with escalation(s)')
    } else {
      await completeRun(runId, 'Maintenance autopilot completed successfully')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await failRun(runId, message).catch(() => {})
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PM Due handler
// ─────────────────────────────────────────────────────────────────────────────

async function handlePMDue(ctx: RunContext, scheduleId: string): Promise<boolean> {
  let escalated = false
  let stepOrder = 0

  // Step 1: Load PM schedule
  const s1 = await addStep(ctx.runId, {
    stepOrder: ++stepOrder,
    name: 'Load PM Schedule',
    inputJson: { scheduleId },
  })
  await startStep(s1)

  // PMSchedule links to Asset which links to Property
  const schedule = await prisma.pMSchedule.findUnique({
    where: { id: scheduleId },
    include: { asset: { select: { propertyId: true, unitId: true } } },
  })

  if (!schedule) {
    await failStep(s1, 'PM schedule not found')
    await failRun(ctx.runId, 'PM schedule not found')
    return false
  }
  await completeStep(s1, { scheduleTitle: schedule.title })

  // Step 2: Policy check
  const s2 = await addStep(ctx.runId, {
    stepOrder: ++stepOrder,
    name: 'Policy: WO Create',
    inputJson: { priority: 'MEDIUM' },
  })
  await startStep(s2)

  const woPolicy = evaluateAction(
    { actionType: 'WO_CREATE', context: { priority: 'MEDIUM' } },
    ctx.policy
  )
  await logAction({
    runId: ctx.runId,
    stepId: s2,
    actionType: 'DECISION',
    target: 'WO_CREATE',
    policyDecision: woPolicy.decision,
    policyReason: woPolicy.reason,
  })

  if (woPolicy.decision === 'BLOCK') {
    await failStep(s2, woPolicy.reason)
    await createException({
      runId: ctx.runId,
      propertyId: ctx.propertyId,
      severity: 'HIGH',
      category: 'SYSTEM',
      title: `PM due: ${schedule.title} — WO creation blocked`,
      details: woPolicy.reason,
      contextJson: { scheduleId, scheduleTitle: schedule.title },
    })
    return true
  }
  await completeStep(s2, { decision: woPolicy.decision })

  // Step 3: Create or find existing WO
  const s3 = await addStep(ctx.runId, {
    stepOrder: ++stepOrder,
    name: 'Create Work Order',
    inputJson: { scheduleId, title: schedule.title },
  })
  await startStep(s3)

  let workOrderId: string

  const existingWO = await prisma.workOrder.findFirst({
    where: {
      propertyId: ctx.propertyId,
      title: { contains: schedule.title },
      status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS'] },
    },
    select: { id: true },
  })

  if (existingWO) {
    workOrderId = existingWO.id
    await completeStep(s3, { workOrderId, reused: true })
  } else {
    try {
      const wo = await prisma.workOrder.create({
        data: {
          propertyId: ctx.propertyId,
          unitId: schedule.asset.unitId,
          submittedById: ctx.managerId,
          title: `PM: ${schedule.title}`,
          description: schedule.description ?? `Preventive maintenance: ${schedule.title}`,
          category: 'GENERAL',
          priority: 'MEDIUM',
          status: 'NEW',
        },
        select: { id: true },
      })
      workOrderId = wo.id
      await logAction({
        runId: ctx.runId,
        stepId: s3,
        actionType: 'API_CALL',
        target: 'prisma.workOrder.create',
        responseJson: { workOrderId: wo.id },
      })
      await completeStep(s3, { workOrderId: wo.id })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await failStep(s3, msg)
      return escalated
    }
  }

  // Step 4: Vendor assignment
  escalated = (await assignVendorStep(ctx, workOrderId, ++stepOrder)) || escalated

  // Step 5: Advance PM schedule
  const s5 = await addStep(ctx.runId, {
    stepOrder: ++stepOrder,
    name: 'Advance PM Schedule',
    inputJson: { scheduleId },
  })
  await startStep(s5)
  try {
    const nextDue = computeNextDue(schedule.nextDueAt, schedule.frequencyDays)
    await prisma.pMSchedule.update({
      where: { id: scheduleId },
      data: { nextDueAt: nextDue, lastRunAt: new Date() },
    })
    await completeStep(s5, { nextDueAt: nextDue.toISOString() })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await failStep(s5, msg)
  }

  return escalated
}

// ─────────────────────────────────────────────────────────────────────────────
// Incident handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleIncident(ctx: RunContext, incidentId: string): Promise<boolean> {
  let escalated = false
  let stepOrder = 0

  const s1 = await addStep(ctx.runId, {
    stepOrder: ++stepOrder,
    name: 'Load Incident',
    inputJson: { incidentId },
  })
  await startStep(s1)

  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
  })

  if (!incident) {
    await failStep(s1, 'Incident not found')
    return false
  }
  await completeStep(s1, { title: incident.title, severity: incident.severity })

  // Safety check — CRITICAL always escalates
  if (incident.severity === 'CRITICAL') {
    await createException({
      runId: ctx.runId,
      propertyId: ctx.propertyId,
      severity: 'CRITICAL',
      category: 'SAFETY',
      title: `Critical incident requires immediate attention: ${incident.title}`,
      details: incident.description,
      contextJson: { incidentId, severity: incident.severity },
      requiresBy: new Date(Date.now() + 4 * 60 * 60 * 1000),
    })
    return true
  }

  // Policy check
  const s2 = await addStep(ctx.runId, {
    stepOrder: ++stepOrder,
    name: 'Policy: WO Create for Incident',
    inputJson: { priority: incident.severity, incidentId },
  })
  await startStep(s2)

  const policyPriority = incident.severity === 'HIGH' ? 'HIGH' : 'MEDIUM'
  const woPolicy = evaluateAction(
    { actionType: 'WO_CREATE', context: { priority: policyPriority } },
    ctx.policy
  )
  await logAction({
    runId: ctx.runId,
    stepId: s2,
    actionType: 'DECISION',
    target: 'WO_CREATE',
    policyDecision: woPolicy.decision,
    policyReason: woPolicy.reason,
  })

  if (woPolicy.decision === 'BLOCK') {
    await failStep(s2, woPolicy.reason)
    await createException({
      runId: ctx.runId,
      propertyId: ctx.propertyId,
      severity: 'HIGH',
      category: 'SYSTEM',
      title: `Incident WO blocked by policy: ${incident.title}`,
      details: woPolicy.reason,
      contextJson: { incidentId },
    })
    return true
  }
  await completeStep(s2, { decision: woPolicy.decision })

  // Create WO
  const s3 = await addStep(ctx.runId, {
    stepOrder: ++stepOrder,
    name: 'Create Work Order from Incident',
    inputJson: { incidentId },
  })
  await startStep(s3)

  let workOrderId: string
  try {
    const wo = await prisma.workOrder.create({
      data: {
        propertyId: ctx.propertyId,
        submittedById: ctx.managerId,
        title: `Incident: ${incident.title}`,
        description: incident.description,
        category: 'GENERAL',
        priority: policyPriority as 'HIGH' | 'MEDIUM',
        status: 'NEW',
      },
      select: { id: true },
    })
    workOrderId = wo.id
    await completeStep(s3, { workOrderId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await failStep(s3, msg)
    return escalated
  }

  escalated = (await assignVendorStep(ctx, workOrderId, ++stepOrder)) || escalated
  return escalated
}

// ─────────────────────────────────────────────────────────────────────────────
// Unassigned WO handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleUnassignedWO(ctx: RunContext, workOrderId: string): Promise<boolean> {
  return assignVendorStep(ctx, workOrderId, 1)
}

// ─────────────────────────────────────────────────────────────────────────────
// Vendor assignment step
// ─────────────────────────────────────────────────────────────────────────────

async function assignVendorStep(
  ctx: RunContext,
  workOrderId: string,
  stepOrder: number
): Promise<boolean> {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: { id: true, category: true, priority: true, title: true, unitId: true },
  })
  if (!workOrder) return false

  const stepId = await addStep(ctx.runId, {
    stepOrder,
    name: 'Assign Vendor',
    inputJson: { workOrderId, category: workOrder.category },
  })
  await startStep(stepId)

  // Find best available vendors for this property + category
  const vendors = await prisma.vendor.findMany({
    where: {
      status: 'ACTIVE',
      serviceCategories: { has: workOrder.category },
      propertyVendors: { some: { propertyId: ctx.propertyId } },
      licenseExpiry: { gte: new Date() },
    },
    orderBy: { performanceScore: 'desc' },
    take: 5,
    select: { id: true, name: true },
  })

  // Also include vendors with no license expiry set (null = not tracked)
  const vendorsNoExpiry = vendors.length === 0
    ? await prisma.vendor.findMany({
        where: {
          status: 'ACTIVE',
          serviceCategories: { has: workOrder.category },
          propertyVendors: { some: { propertyId: ctx.propertyId } },
          licenseExpiry: null,
        },
        orderBy: { performanceScore: 'desc' },
        take: 5,
        select: { id: true, name: true },
      })
    : []

  let allVendors = [...vendors, ...vendorsNoExpiry]

  // Memory: if we have a preferred vendor for this property+category, move them
  // to the front of the list so they get priority in the policy loop below.
  const preferredVendorId = await getPreferredVendor(ctx.propertyId, workOrder.category)
  if (preferredVendorId) {
    const idx = allVendors.findIndex(v => v.id === preferredVendorId)
    if (idx > 0) {
      // Move preferred vendor to front
      allVendors = [allVendors[idx], ...allVendors.slice(0, idx), ...allVendors.slice(idx + 1)]
    }
    await logAction({
      runId: ctx.runId,
      stepId,
      actionType: 'MEMORY_READ',
      target: `preferred_vendor_${workOrder.category}`,
      responseJson: { preferredVendorId, found: idx >= 0 },
    })
  }

  if (allVendors.length === 0) {
    await failStep(stepId, 'No eligible vendor found for this property/category')
    await createException({
      runId: ctx.runId,
      propertyId: ctx.propertyId,
      severity: 'MEDIUM',
      category: 'SLA',
      title: `No vendor available for WO: ${workOrder.title}`,
      details: `No active vendor found for category ${workOrder.category} at this property.`,
      contextJson: { workOrderId, category: workOrder.category },
    })
    return true
  }

  // Find first vendor within policy
  let chosenVendorId: string | null = null
  for (const vendor of allVendors) {
    const openCount = await prisma.workOrder.count({
      where: {
        assignedVendorId: vendor.id,
        status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
      },
    })
    const policyResult = evaluateAction(
      {
        actionType: 'WO_ASSIGN_VENDOR',
        context: {
          category: workOrder.category,
          priority: workOrder.priority,
          vendorOpenWOCount: openCount,
        },
      },
      ctx.policy
    )
    if (policyResult.decision === 'ALLOW') {
      chosenVendorId = vendor.id
      break
    }
  }

  if (!chosenVendorId) {
    await failStep(stepId, 'All vendors blocked by policy (capacity or priority rule)')
    await createException({
      runId: ctx.runId,
      propertyId: ctx.propertyId,
      severity: 'HIGH',
      category: 'SLA',
      title: `Cannot auto-assign vendor for WO: ${workOrder.title}`,
      details: 'All available vendors are at capacity or policy blocks auto-assignment.',
      contextJson: { workOrderId },
    })
    return true
  }

  await prisma.workOrder.update({
    where: { id: workOrderId },
    data: { assignedVendorId: chosenVendorId, status: 'ASSIGNED' },
  })
  await logAction({
    runId: ctx.runId,
    stepId,
    actionType: 'API_CALL',
    target: 'prisma.workOrder.update',
    requestJson: { workOrderId, assignedVendorId: chosenVendorId },
    responseJson: { status: 'ASSIGNED' },
  })

  // Memory: remember this vendor as preferred for this property+category
  await setPreferredVendor(ctx.propertyId, workOrder.category, chosenVendorId)
  await logAction({
    runId: ctx.runId,
    stepId,
    actionType: 'MEMORY_WRITE',
    target: `preferred_vendor_${workOrder.category}`,
    requestJson: { vendorId: chosenVendorId },
  })

  await completeStep(stepId, { assignedVendorId: chosenVendorId, memorized: true })

  // Notify tenant via active lease on unit
  if (workOrder.unitId) {
    const activeLease = await prisma.lease.findFirst({
      where: { unitId: workOrder.unitId, status: 'ACTIVE' },
      include: { tenant: { select: { userId: true } } },
    })
    if (activeLease?.tenant?.userId) {
      await deliverNotification({
        userId: activeLease.tenant.userId,
        title: 'Work order assigned',
        body: `Your maintenance request "${workOrder.title}" has been assigned and is being handled.`,
        type: 'WORK_ORDER',
        entityType: 'work_order',
        entityId: workOrderId,
      })
    }
  }

  // Notify manager
  if (ctx.managerId) {
    await deliverNotification({
      userId: ctx.managerId,
      title: 'Agent: Work order auto-assigned',
      body: `WO "${workOrder.title}" was automatically assigned to a vendor.`,
      type: 'AGENT_ACTION',
      entityType: 'work_order',
      entityId: workOrderId,
    })
  }

  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function computeNextDue(current: Date, frequencyDays: number): Date {
  const next = new Date(current)
  next.setDate(next.getDate() + (frequencyDays > 0 ? frequencyDays : 30))
  return next
}
