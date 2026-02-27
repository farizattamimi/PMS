import { prisma } from './prisma'
import { anthropic, AI_MODEL } from './ai'
import { writeAudit } from './audit'
import { createNotification } from './notify'
import { AgentAction, AgentActionType, WorkOrderCategory } from '@prisma/client'
import { evaluateAction } from './policy-engine'
import { loadPolicyForProperty } from './agent-runtime'

export interface ExecuteResult {
  ok: boolean
  detail?: string
  error?: string
}

const LEGAL_KEYWORDS = [
  'lawsuit',
  'sue',
  'attorney',
  'lawyer',
  'legal action',
  'discrimination',
  'harassment',
  'eviction notice',
  'habitability',
  'uninhabitable',
  'breach of contract',
  'negligence',
  'personal injury',
  'threat',
  'threatening',
  'mold',
  'retaliation',
]

async function managerOwnsProperty(managerId: string, propertyId: string): Promise<boolean> {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, managerId },
    select: { id: true },
  })
  return !!property
}

async function validateActionScope(action: AgentAction, managerId: string): Promise<ExecuteResult> {
  const payload = action.payload as Record<string, unknown>

  switch (action.actionType) {
    case 'SEND_MESSAGE': {
      if (typeof payload.body !== 'string' || payload.body.trim().length === 0) {
        return { ok: false, error: 'Invalid payload: body is required' }
      }
      if (payload.threadId) {
        const thread = await prisma.messageThread.findFirst({
          where: { id: payload.threadId as string, property: { managerId } },
          select: { id: true },
        })
        if (!thread) return { ok: false, error: 'Forbidden: thread is outside manager scope' }
        return { ok: true }
      }

      const propertyId = payload.propertyId as string | undefined
      const tenantId = payload.tenantId as string | undefined
      if (!propertyId || !tenantId || typeof payload.subject !== 'string') {
        return { ok: false, error: 'Invalid payload: propertyId, tenantId, and subject are required' }
      }
      if (!(await managerOwnsProperty(managerId, propertyId))) {
        return { ok: false, error: 'Forbidden: property is outside manager scope' }
      }
      const tenant = await prisma.tenant.findFirst({
        where: {
          id: tenantId,
          OR: [
            { propertyId },
            { leases: { some: { propertyId } } },
          ],
        },
        select: { id: true },
      })
      if (!tenant) return { ok: false, error: 'Forbidden: tenant is outside property scope' }
      return { ok: true }
    }

    case 'ASSIGN_VENDOR': {
      const workOrderId = payload.workOrderId as string | undefined
      const vendorId = payload.vendorId as string | undefined
      if (!workOrderId || !vendorId) {
        return { ok: false, error: 'Invalid payload: workOrderId and vendorId are required' }
      }
      const wo = await prisma.workOrder.findFirst({
        where: { id: workOrderId, property: { managerId } },
        select: { propertyId: true },
      })
      if (!wo) return { ok: false, error: 'Forbidden: work order is outside manager scope' }
      const linkedVendor = await prisma.propertyVendor.findFirst({
        where: { propertyId: wo.propertyId, vendorId },
        select: { id: true },
      })
      if (!linkedVendor) return { ok: false, error: 'Forbidden: vendor not linked to property' }
      return { ok: true }
    }

    case 'SEND_BID_REQUEST': {
      const workOrderId = payload.workOrderId as string | undefined
      const vendorIds = payload.vendorIds as string[] | undefined
      if (!workOrderId || !Array.isArray(vendorIds) || vendorIds.length === 0) {
        return { ok: false, error: 'Invalid payload: workOrderId and vendorIds are required' }
      }
      const wo = await prisma.workOrder.findFirst({
        where: { id: workOrderId, property: { managerId } },
        select: { propertyId: true },
      })
      if (!wo) return { ok: false, error: 'Forbidden: work order is outside manager scope' }
      const linkedCount = await prisma.propertyVendor.count({
        where: { propertyId: wo.propertyId, vendorId: { in: vendorIds } },
      })
      if (linkedCount !== vendorIds.length) {
        return { ok: false, error: 'Forbidden: one or more vendors are not linked to property' }
      }
      return { ok: true }
    }

    case 'ACCEPT_BID': {
      const bidId = payload.bidId as string | undefined
      if (!bidId) return { ok: false, error: 'Invalid payload: bidId is required' }
      const bid = await prisma.bidRequest.findFirst({
        where: { id: bidId, workOrder: { property: { managerId } } },
        select: { id: true },
      })
      if (!bid) return { ok: false, error: 'Forbidden: bid is outside manager scope' }
      return { ok: true }
    }

    case 'SEND_RENEWAL_OFFER': {
      const leaseId = payload.leaseId as string | undefined
      if (!leaseId) return { ok: false, error: 'Invalid payload: leaseId is required' }
      const lease = await prisma.lease.findFirst({
        where: {
          id: leaseId,
          OR: [
            { property: { managerId } },
            { unit: { property: { managerId } } },
          ],
        },
        select: { id: true },
      })
      if (!lease) return { ok: false, error: 'Forbidden: lease is outside manager scope' }
      return { ok: true }
    }

    case 'CREATE_WORK_ORDER': {
      const propertyId = payload.propertyId as string | undefined
      if (!propertyId) return { ok: false, error: 'Invalid payload: propertyId is required' }
      if (!(await managerOwnsProperty(managerId, propertyId))) {
        return { ok: false, error: 'Forbidden: property is outside manager scope' }
      }
      if (payload.unitId) {
        const unit = await prisma.unit.findFirst({
          where: { id: payload.unitId as string, propertyId },
          select: { id: true },
        })
        if (!unit) return { ok: false, error: 'Forbidden: unit is outside property scope' }
      }
      return { ok: true }
    }

    case 'CLOSE_THREAD': {
      const threadId = payload.threadId as string | undefined
      if (!threadId) return { ok: false, error: 'Invalid payload: threadId is required' }
      const thread = await prisma.messageThread.findFirst({
        where: { id: threadId, property: { managerId } },
        select: { id: true },
      })
      if (!thread) return { ok: false, error: 'Forbidden: thread is outside manager scope' }
      return { ok: true }
    }

    default:
      return { ok: false, error: `Unknown action type: ${action.actionType}` }
  }
}

async function autoExecutionPolicyDecision(action: AgentAction): Promise<{ allow: boolean; reason: string }> {
  const payload = action.payload as Record<string, unknown>

  switch (action.actionType) {
    case 'CREATE_WORK_ORDER': {
      const propertyId = payload.propertyId as string | undefined
      if (!propertyId) return { allow: false, reason: 'Missing propertyId for policy evaluation' }
      const policy = await loadPolicyForProperty(propertyId)
      const priority = (payload.priority as string) ?? 'MEDIUM'
      const result = evaluateAction({ actionType: 'WO_CREATE', context: { priority } }, policy)
      return { allow: result.decision === 'ALLOW', reason: result.reason }
    }

    case 'ASSIGN_VENDOR': {
      const workOrderId = payload.workOrderId as string | undefined
      const vendorId = payload.vendorId as string | undefined
      if (!workOrderId || !vendorId) {
        return { allow: false, reason: 'Missing workOrderId/vendorId for policy evaluation' }
      }
      const wo = await prisma.workOrder.findUnique({
        where: { id: workOrderId },
        select: { propertyId: true, category: true, priority: true },
      })
      if (!wo) return { allow: false, reason: 'Work order not found for policy evaluation' }
      const vendorOpenWOCount = await prisma.workOrder.count({
        where: {
          assignedVendorId: vendorId,
          status: { notIn: ['COMPLETED', 'CANCELED'] },
        },
      })
      const policy = await loadPolicyForProperty(wo.propertyId)
      const result = evaluateAction(
        {
          actionType: 'WO_ASSIGN_VENDOR',
          context: {
            category: wo.category,
            priority: wo.priority,
            vendorOpenWOCount,
          },
        },
        policy
      )
      return { allow: result.decision === 'ALLOW', reason: result.reason }
    }

    case 'SEND_BID_REQUEST': {
      const workOrderId = payload.workOrderId as string | undefined
      if (!workOrderId) return { allow: false, reason: 'Missing workOrderId for policy evaluation' }
      const wo = await prisma.workOrder.findUnique({
        where: { id: workOrderId },
        select: { propertyId: true },
      })
      if (!wo) return { allow: false, reason: 'Work order not found for policy evaluation' }
      const policy = await loadPolicyForProperty(wo.propertyId)
      const result = evaluateAction({ actionType: 'WO_BID_REQUEST', context: {} }, policy)
      return { allow: result.decision === 'ALLOW', reason: result.reason }
    }

    case 'SEND_MESSAGE': {
      let propertyId = action.propertyId ?? null
      if (!propertyId && payload.threadId) {
        const thread = await prisma.messageThread.findUnique({
          where: { id: payload.threadId as string },
          select: { propertyId: true },
        })
        propertyId = thread?.propertyId ?? null
      }
      if (!propertyId && payload.propertyId) propertyId = payload.propertyId as string
      if (!propertyId) return { allow: false, reason: 'Missing property scope for message policy evaluation' }
      const policy = await loadPolicyForProperty(propertyId)
      const body = String(payload.body ?? '').toLowerCase()
      const hasLegalKeywords = LEGAL_KEYWORDS.some((kw) => body.includes(kw)) || !!payload.hasLegalKeywords
      const intent = typeof payload.intent === 'string' ? payload.intent : 'OTHER'
      const result = evaluateAction(
        { actionType: 'MESSAGE_SEND', context: { intent, hasLegalKeywords } },
        policy
      )
      return { allow: result.decision === 'ALLOW', reason: result.reason }
    }

    default:
      return {
        allow: false,
        reason: `Auto-execution is disabled for ${action.actionType}; manager approval required`,
      }
  }
}

// ── executeAction ─────────────────────────────────────────────────────────────

export async function executeAction(
  action: AgentAction,
  actorUserId: string,
): Promise<ExecuteResult> {
  try {
    if (action.managerId !== actorUserId) {
      return { ok: false, error: 'Forbidden: action manager mismatch' }
    }
    const scopeResult = await validateActionScope(action, actorUserId)
    if (!scopeResult.ok) return scopeResult

    const payload = action.payload as Record<string, unknown>

    switch (action.actionType) {
      case 'SEND_MESSAGE': {
        if (payload.threadId) {
          const threadId = payload.threadId as string
          await prisma.message.create({
            data: {
              threadId,
              authorId: actorUserId,
              body: payload.body as string,
            },
          })
          // Notify tenant (tenantId is Tenant model ID, look up userId)
          const thread = await prisma.messageThread.findUnique({
            where: { id: threadId },
            select: { tenantId: true, subject: true },
          })
          if (thread?.tenantId) {
            const tenant = await prisma.tenant.findUnique({
              where: { id: thread.tenantId },
              select: { userId: true },
            })
            if (tenant?.userId) {
              await createNotification({
                userId: tenant.userId,
                title: 'New message from your manager',
                body: (payload.body as string).slice(0, 120),
                type: 'GENERAL',
                entityType: 'MessageThread',
                entityId: threadId,
              })
            }
          }
          return { ok: true, detail: 'Message sent to existing thread' }
        } else {
          const thread = await prisma.messageThread.create({
            data: {
              propertyId: payload.propertyId as string,
              tenantId: payload.tenantId as string,
              subject: payload.subject as string,
              messages: {
                create: {
                  authorId: actorUserId,
                  body: payload.body as string,
                },
              },
            },
            include: {
              tenant: { select: { userId: true } },
            },
          })
          if (thread.tenant?.userId) {
            await createNotification({
              userId: thread.tenant.userId,
              title: 'New message from your manager',
              body: (payload.body as string).slice(0, 120),
              type: 'GENERAL',
              entityType: 'MessageThread',
              entityId: thread.id,
            })
          }
          return { ok: true, detail: `Thread created: ${thread.id}` }
        }
      }

      case 'ASSIGN_VENDOR': {
        const workOrderId = payload.workOrderId as string
        const vendorId = payload.vendorId as string
        await prisma.workOrder.update({
          where: { id: workOrderId },
          data: { assignedVendorId: vendorId, status: 'ASSIGNED' },
        })
        await writeAudit({
          actorUserId,
          action: 'UPDATE',
          entityType: 'WorkOrder',
          entityId: workOrderId,
          diff: { assignedVendorId: vendorId, status: 'ASSIGNED' },
        })
        return { ok: true, detail: 'Vendor assigned and WO moved to ASSIGNED' }
      }

      case 'SEND_BID_REQUEST': {
        const workOrderId = payload.workOrderId as string
        const vendorIds = payload.vendorIds as string[]
        let created = 0
        for (const vendorId of vendorIds) {
          const existing = await prisma.bidRequest.findFirst({
            where: { workOrderId, vendorId, status: 'PENDING' },
          })
          if (!existing) {
            await prisma.bidRequest.create({
              data: { workOrderId, vendorId, status: 'PENDING' },
            })
            created++
          }
        }
        return { ok: true, detail: `${created} bid request(s) created` }
      }

      case 'ACCEPT_BID': {
        const bidId = payload.bidId as string
        const bid = await prisma.bidRequest.findUnique({
          where: { id: bidId },
          include: { workOrder: true },
        })
        if (!bid) return { ok: false, error: 'Bid not found' }
        if (bid.status !== 'SUBMITTED') {
          return { ok: false, error: `Bid status is ${bid.status}, not SUBMITTED` }
        }
        await prisma.bidRequest.update({ where: { id: bidId }, data: { status: 'ACCEPTED' } })
        await prisma.workOrder.update({
          where: { id: bid.workOrderId },
          data: { assignedVendorId: bid.vendorId, status: 'ASSIGNED' },
        })
        await prisma.bidRequest.updateMany({
          where: { workOrderId: bid.workOrderId, id: { not: bidId }, status: 'PENDING' },
          data: { status: 'DECLINED' },
        })
        await writeAudit({
          actorUserId,
          action: 'UPDATE',
          entityType: 'BidRequest',
          entityId: bidId,
          diff: { status: 'ACCEPTED', workOrderId: bid.workOrderId },
        })
        return { ok: true, detail: 'Bid accepted, WO assigned to vendor' }
      }

      case 'SEND_RENEWAL_OFFER': {
        const leaseId = payload.leaseId as string
        const expiryDays = typeof payload.expiryDays === 'number' ? payload.expiryDays : 14
        const expiryDate = new Date()
        expiryDate.setDate(expiryDate.getDate() + expiryDays)

        // Fetch lease to get current rent as fallback if agent omitted it
        const lease = await prisma.lease.findUnique({
          where: { id: leaseId },
          include: { tenant: { include: { user: true } } },
        })
        if (!lease) return { ok: false, error: `Lease ${leaseId} not found` }

        const offeredRent =
          typeof payload.offeredRent === 'number' ? payload.offeredRent : lease.monthlyRent
        const termMonths =
          typeof payload.termMonths === 'number' ? payload.termMonths : 12

        const offer = await prisma.leaseRenewalOffer.create({
          data: {
            leaseId,
            offeredRent,
            termMonths,
            expiryDate,
            notes: payload.notes as string | undefined,
            status: 'PENDING',
          },
        })
        if (lease.tenant?.user?.id) {
          await createNotification({
            userId: lease.tenant.user.id,
            title: 'Renewal offer from your manager',
            body: `You have a new lease renewal offer: ${termMonths} months at $${offeredRent}/mo.`,
            type: 'GENERAL',
            entityType: 'LeaseRenewalOffer',
            entityId: offer.id,
          })
        }
        await writeAudit({
          actorUserId,
          action: 'CREATE',
          entityType: 'LeaseRenewalOffer',
          entityId: offer.id,
        })
        return { ok: true, detail: `Renewal offer sent: ${offer.id}` }
      }

      case 'CREATE_WORK_ORDER': {
        const wo = await prisma.workOrder.create({
          data: {
            propertyId: payload.propertyId as string,
            unitId: payload.unitId as string | undefined,
            submittedById: actorUserId,
            title: payload.title as string,
            description: payload.description as string,
            category: (payload.category ?? 'GENERAL') as any,
            priority: (payload.priority ?? 'MEDIUM') as any,
            status: 'NEW',
          },
        })
        await writeAudit({
          actorUserId,
          action: 'CREATE',
          entityType: 'WorkOrder',
          entityId: wo.id,
        })
        return { ok: true, detail: `Work order created: ${wo.id}` }
      }

      case 'CLOSE_THREAD': {
        const threadId = payload.threadId as string
        await prisma.messageThread.update({
          where: { id: threadId },
          data: { status: 'CLOSED' },
        })
        return { ok: true, detail: 'Thread closed' }
      }

      default:
        return { ok: false, error: `Unknown action type: ${action.actionType}` }
    }
  } catch (err: any) {
    console.error('[agent] executeAction error:', err)
    return { ok: false, error: err?.message ?? 'Unknown error' }
  }
}

// ── runAgentForManager ────────────────────────────────────────────────────────

interface AgentRunResult {
  actionsQueued: number
  actionsExecuted: number
  itemsReviewed: number
}

export async function runAgentForManager(managerId: string): Promise<AgentRunResult> {
  const counters = { actionsQueued: 0, actionsExecuted: 0, itemsReviewed: 0 }

  // 1. Upsert settings
  const settings = await prisma.agentSettings.upsert({
    where: { managerId },
    update: {},
    create: {
      managerId,
      enabled: false,
      autoExecuteTypes: [],
      tone: 'professional',
    },
  })

  // 2. Load managed properties
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)

  const properties: any[] = await prisma.property.findMany({
    where: { managerId },
    include: {
      workOrders: {
        where: {
          OR: [
            { status: 'NEW', assignedVendorId: null, createdAt: { lte: oneHourAgo } },
            { bids: { some: { status: 'SUBMITTED' } } },
          ],
        },
        include: {
          unit: { select: { unitNumber: true } },
          bids: {
            where: { status: 'SUBMITTED' },
            include: { vendor: { select: { id: true, name: true, performanceScore: true } } },
            orderBy: { amount: 'asc' },
          },
        },
      },
      threads: {
        where: { status: 'OPEN' },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 3,
          },
          tenant: { include: { user: { select: { id: true, name: true } } } },
        },
      },
      leases: {
        where: { status: 'ACTIVE', endDate: { lte: sixtyDaysFromNow } },
        include: {
          renewalOffers: { where: { status: 'PENDING' }, take: 1 },
          tenant: { include: { user: { select: { id: true, name: true } } } },
          unit: { select: { unitNumber: true, monthlyRent: true } },
        },
      },
    },
  })

  if (properties.length === 0) return counters

  // 3. Build system prompt
  let snapshot = ''
  for (const p of properties) {
    snapshot += `\n### Property: ${p.name} (id: ${p.id})\n`

    if (p.workOrders.length > 0) {
      snapshot += `**Pending Work Orders:**\n`
      for (const wo of p.workOrders) {
        snapshot += `- WO ${wo.id}: "${wo.title}" status=${wo.status} unit=${wo.unit?.unitNumber ?? 'N/A'}`
        if (wo.bids.length > 0) {
          snapshot += ` | Submitted bids: ${wo.bids.map((b: any) => `${b.vendor.name} $${b.amount ?? '?'}`).join(', ')}`
        }
        snapshot += '\n'
      }
      counters.itemsReviewed += p.workOrders.length
    }

    if (p.threads.length > 0) {
      snapshot += `**Open Message Threads:**\n`
      for (const t of p.threads) {
        const lastMsg = t.messages[0]
        snapshot += `- Thread ${t.id}: tenant=${t.tenant?.user?.name ?? 'unknown'} lastMsg="${lastMsg?.body?.slice(0, 80) ?? ''}"...\n`
      }
      counters.itemsReviewed += p.threads.length
    }

    if (p.leases.length > 0) {
      snapshot += `**Expiring Leases (within 60 days):**\n`
      for (const l of p.leases) {
        const daysLeft = Math.floor((new Date(l.endDate).getTime() - now.getTime()) / 86400000)
        const hasPendingOffer = l.renewalOffers.length > 0
        snapshot += `- Lease ${l.id}: tenant=${l.tenant?.user?.name ?? 'unknown'} tenantId=${l.tenant?.id} unit=${l.unit?.unitNumber} expires in ${daysLeft}d rent=$${l.monthlyRent}/mo${hasPendingOffer ? ' [offer already sent]' : ' [no offer sent]'}\n`
      }
      counters.itemsReviewed += p.leases.length
    }
  }

  const systemPrompt = `You are an autonomous AI property management agent working on behalf of a property manager (id: ${managerId}).
Review the portfolio snapshot and propose relevant actions to help the manager.

${snapshot}

Tone preference: ${settings.tone}.

Use your tools to:
1. Propose specific actions (propose_action) for unassigned work orders, unanswered tenant messages, and expiring leases without renewal offers.
2. Use get_best_vendor before proposing ASSIGN_VENDOR or SEND_BID_REQUEST actions.
3. Use draft_message to compose professional message bodies.
4. Use get_submitted_bids when deciding whether to propose ACCEPT_BID.

Payload requirements per action type:
- SEND_RENEWAL_OFFER: must include leaseId, offeredRent (number, use current rent from snapshot), termMonths (number, default 12)
- ASSIGN_VENDOR: must include workOrderId, vendorId
- SEND_BID_REQUEST: must include workOrderId, vendorIds (array of strings)
- ACCEPT_BID: must include bidId
- SEND_MESSAGE: must include body; either threadId (existing) or propertyId + tenantId + subject (new thread)
- CREATE_WORK_ORDER: must include propertyId, title, description
- CLOSE_THREAD: must include threadId

Be specific and actionable. Only propose actions that are clearly needed based on the data. Do not propose more than 10 actions total.`

  // 4. Tool definitions
  const agentTools: any[] = [
    {
      name: 'propose_action',
      description: 'Propose or queue an agent action for the manager to review or auto-execute.',
      input_schema: {
        type: 'object',
        properties: {
          actionType: {
            type: 'string',
            enum: ['SEND_MESSAGE', 'ASSIGN_VENDOR', 'SEND_BID_REQUEST', 'ACCEPT_BID', 'SEND_RENEWAL_OFFER', 'CREATE_WORK_ORDER', 'CLOSE_THREAD'],
          },
          title: { type: 'string' },
          reasoning: { type: 'string' },
          propertyId: { type: 'string' },
          entityType: { type: 'string' },
          entityId: { type: 'string' },
          payload: { type: 'object' },
        },
        required: ['actionType', 'title', 'reasoning', 'payload'],
      },
    },
    {
      name: 'get_best_vendor',
      description: 'Find the best vendors for a given category and property.',
      input_schema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'WO category: PLUMBING, HVAC, ELECTRICAL, GENERAL, TURNOVER, OTHER' },
          propertyId: { type: 'string' },
        },
        required: ['category', 'propertyId'],
      },
    },
    {
      name: 'draft_message',
      description: 'Draft a professional message body for a tenant.',
      input_schema: {
        type: 'object',
        properties: {
          context: { type: 'string', description: 'What the message is about' },
          tone: { type: 'string', description: 'Tone: professional, friendly, concise' },
          tenantName: { type: 'string' },
        },
        required: ['context'],
      },
    },
    {
      name: 'get_submitted_bids',
      description: 'Get submitted bids for a work order.',
      input_schema: {
        type: 'object',
        properties: {
          workOrderId: { type: 'string' },
        },
        required: ['workOrderId'],
      },
    },
  ]

  // 5. Agentic loop
  const apiMessages: any[] = [
    { role: 'user', content: 'Review the portfolio and propose actions where needed. Use your tools to gather info and propose actions.' },
  ]

  for (let i = 0; i < 10; i++) {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      tools: agentTools,
      messages: apiMessages,
    })

    if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') break

    if (response.stop_reason === 'tool_use') {
      apiMessages.push({ role: 'assistant', content: response.content })
      const toolResults: any[] = []

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue
        const input = block.input as Record<string, unknown>
        let result: unknown

        if (block.name === 'propose_action') {
          const actionType = input.actionType as AgentActionType
          const isAutoExecute = settings.autoExecuteTypes.includes(actionType)

          const created = await prisma.agentAction.create({
            data: {
              managerId,
              propertyId: input.propertyId as string | undefined,
              actionType,
              status: 'PENDING_APPROVAL',
              title: input.title as string,
              reasoning: input.reasoning as string,
              payload: input.payload as any,
              entityType: input.entityType as string | undefined,
              entityId: input.entityId as string | undefined,
            },
          })

          if (isAutoExecute) {
            const policyGate = await autoExecutionPolicyDecision(created)
            if (!policyGate.allow) {
              await prisma.agentAction.update({
                where: { id: created.id },
                data: {
                  status: 'PENDING_APPROVAL',
                  result: {
                    autoExecutionBlocked: true,
                    reason: policyGate.reason,
                  } as any,
                },
              })
              counters.actionsQueued++
              result = {
                queued: true,
                autoExecuted: false,
                actionId: created.id,
                reason: policyGate.reason,
              }
            } else {
              const execResult = await executeAction(created, managerId)
              await prisma.agentAction.update({
                where: { id: created.id },
                data: {
                  result: execResult as any,
                  status: execResult.ok ? 'AUTO_EXECUTED' : 'FAILED',
                  executedAt: new Date(),
                  respondedAt: new Date(),
                },
              })
              counters.actionsExecuted++
              result = { queued: true, autoExecuted: true, actionId: created.id, execResult }
            }
          } else {
            counters.actionsQueued++
            result = { queued: true, autoExecuted: false, actionId: created.id }
          }
        } else if (block.name === 'get_best_vendor') {
          const category = input.category as string
          const propertyId = input.propertyId as string
          const today = new Date()
          const vendors = await prisma.vendor.findMany({
            where: {
              serviceCategories: { has: category as WorkOrderCategory },
              propertyVendors: { some: { propertyId } },
              status: 'ACTIVE',
              OR: [
                { licenseExpiry: null },
                { licenseExpiry: { gte: today } },
              ],
              AND: [
                {
                  OR: [
                    { insuranceExpiry: null },
                    { insuranceExpiry: { gte: today } },
                  ],
                },
              ],
            },
            orderBy: { performanceScore: 'desc' },
            take: 5,
            select: {
              id: true,
              name: true,
              performanceScore: true,
              reviewCount: true,
              serviceCategories: true,
            },
          })
          result = vendors
        } else if (block.name === 'draft_message') {
          const draftResp = await anthropic.messages.create({
            model: AI_MODEL,
            max_tokens: 300,
            messages: [
              {
                role: 'user',
                content: `Write a ${input.tone ?? settings.tone} message to tenant ${input.tenantName ?? ''} about: ${input.context}. Keep it under 150 words. Return only the message body.`,
              },
            ],
          })
          const textBlock = draftResp.content.find((b: any) => b.type === 'text')
          result = { draft: textBlock?.type === 'text' ? textBlock.text : '' }
        } else if (block.name === 'get_submitted_bids') {
          const workOrderId = input.workOrderId as string
          const bids = await prisma.bidRequest.findMany({
            where: { workOrderId, status: 'SUBMITTED' },
            include: { vendor: { select: { id: true, name: true, performanceScore: true } } },
            orderBy: { amount: 'asc' },
          })
          result = bids
        } else {
          result = { error: 'Unknown tool' }
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        })
      }

      apiMessages.push({ role: 'user', content: toolResults })
    } else {
      break
    }
  }

  // Notify manager if any actions need approval
  if (counters.actionsQueued > 0) {
    const n = counters.actionsQueued
    await createNotification({
      userId: managerId,
      title: `Agent queued ${n} action${n > 1 ? 's' : ''} for your review`,
      body: `${n} proposed action${n > 1 ? 's' : ''} need${n === 1 ? 's' : ''} your approval in the Agent Inbox.`,
      type: 'GENERAL',
      entityType: 'AgentAction',
      entityId: managerId,
    })
  }

  return counters
}
