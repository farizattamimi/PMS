import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { anthropic, AI_MODEL, streamResponse } from '@/lib/ai'
import { WorkOrderStatus } from '@prisma/client'
import Anthropic from '@anthropic-ai/sdk'
import { executeAction, runAgentForManager } from '@/lib/agent'
import { checkRateLimit, rateLimitHeaders, resolveRateLimitKey } from '@/lib/rate-limit'
import { acquireActionExecutionLock, releaseActionExecutionLock } from '@/lib/action-execution-lock'

// ── Tool definitions ─────────────────────────────────────────────────────────

const TENANT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_my_lease',
    description: "Get the tenant's active lease details: unit number, property, monthly rent, start date, end date, and days until expiry.",
    input_schema: { type: 'object' },
  },
  {
    name: 'get_payment_history',
    description: "Get the tenant's ledger entries (rent charges and payments) and current account balance.",
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max transactions to return (default 10)' },
      },
    },
  },
  {
    name: 'make_payment',
    description: "Create a Stripe payment link for the tenant. Only call this after the tenant has explicitly confirmed the payment amount. Returns a checkout URL the tenant must visit to complete payment.",
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Payment amount in dollars (positive number)' },
        memo: { type: 'string', description: 'Optional memo/note for the payment' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'get_work_orders',
    description: "Get the tenant's maintenance work orders.",
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Optional status filter: NEW, ASSIGNED, IN_PROGRESS, BLOCKED, COMPLETED, CANCELED',
        },
      },
    },
  },
  {
    name: 'submit_work_order',
    description: "Submit a new maintenance work order for the tenant's unit. Only call after confirming title and description with the tenant.",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Brief title of the issue' },
        description: { type: 'string', description: 'Detailed description of the problem' },
        category: {
          type: 'string',
          description: 'Category: PLUMBING, HVAC, ELECTRICAL, GENERAL, TURNOVER, OTHER',
        },
        priority: {
          type: 'string',
          description: 'Priority: LOW, MEDIUM, HIGH, EMERGENCY',
        },
      },
      required: ['title', 'description'],
    },
  },
  {
    name: 'get_renewal_offers',
    description: "Check for any pending or recent lease renewal offers on the tenant's current lease.",
    input_schema: { type: 'object' },
  },
  {
    name: 'accept_renewal_offer',
    description: "Accept a pending lease renewal offer. This extends the lease endDate and updates monthly rent. Only call after confirming with the tenant.",
    input_schema: {
      type: 'object',
      properties: { offerId: { type: 'string', description: 'The ID of the renewal offer to accept' } },
      required: ['offerId'],
    },
  },
  {
    name: 'request_renewal',
    description: "Submit a renewal request to the property manager. Use when the tenant wants to renew but there's no pending offer.",
    input_schema: {
      type: 'object',
      properties: {
        termMonths: { type: 'number', description: 'Number of months to renew for (e.g. 6, 12, 24)' },
        notes: { type: 'string', description: 'Optional message to the manager' },
      },
      required: ['termMonths'],
    },
  },
]

// ── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userId: string,
  leaseId: string | null,
): Promise<unknown> {
  switch (name) {
    case 'get_my_lease': {
      const tenant = await prisma.tenant.findUnique({
        where: { userId },
        include: {
          leases: {
            where: { status: 'ACTIVE' },
            include: {
              unit: {
                include: { property: { select: { name: true, address: true, city: true, state: true } } },
              },
            },
            take: 1,
          },
        },
      })
      const lease = tenant?.leases[0]
      if (!lease) return { error: 'No active lease found' }
      const daysLeft = Math.max(0, Math.floor((new Date(lease.endDate).getTime() - Date.now()) / 86400000))
      return {
        unitNumber: lease.unit.unitNumber,
        property: lease.unit.property.name,
        address: `${lease.unit.property.address}, ${lease.unit.property.city}, ${lease.unit.property.state}`,
        monthlyRent: lease.monthlyRent,
        startDate: new Date(lease.startDate).toISOString().split('T')[0],
        endDate: new Date(lease.endDate).toISOString().split('T')[0],
        daysUntilExpiry: daysLeft,
      }
    }

    case 'get_payment_history': {
      if (!leaseId) return { error: 'No active lease' }
      const limit = typeof input.limit === 'number' ? Math.min(input.limit, 30) : 10
      const entries = await prisma.ledgerEntry.findMany({
        where: { leaseId },
        orderBy: { effectiveDate: 'desc' },
        take: limit,
      })
      const balance = entries.reduce((sum, e) => sum + e.amount, 0)
      return {
        balance,
        balanceStatus: balance >= 0 ? 'owed' : 'credit',
        transactions: entries.map(e => ({
          date: new Date(e.effectiveDate).toISOString().split('T')[0],
          type: e.type,
          amount: e.amount,
          memo: e.memo ?? null,
        })),
      }
    }

    case 'make_payment': {
      if (!leaseId) return { error: 'No active lease found' }
      const rawAmount = input.amount
      if (typeof rawAmount !== 'number' || rawAmount <= 0) return { error: 'Invalid payment amount' }

      // Create a Stripe Checkout Session instead of a direct ledger entry
      const { stripe } = await import('@/lib/stripe')
      const tenant = await prisma.tenant.findUnique({
        where: { userId },
        include: {
          leases: {
            where: { status: 'ACTIVE' },
            include: { unit: { include: { property: { select: { id: true, name: true } } } } },
            take: 1,
          },
        },
      })
      const lease = tenant?.leases[0]
      if (!lease) return { error: 'No active lease found' }

      const origin = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
      const memo = typeof input.memo === 'string' && input.memo ? input.memo : 'Tenant payment via AI assistant'

      const checkoutSession = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: Math.round(rawAmount * 100),
              product_data: {
                name: `Rent Payment — ${lease.unit.property.name}`,
                description: memo,
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          leaseId: lease.id,
          propertyId: lease.unit.propertyId,
          tenantUserId: userId,
          tenantId: tenant!.id,
          memo,
          amountDollars: String(rawAmount),
        },
        success_url: `${origin}/dashboard/my-payments?payment=success`,
        cancel_url: `${origin}/dashboard/my-payments?payment=cancelled`,
      })

      return {
        checkoutUrl: checkoutSession.url,
        message: `Click the link below to complete your $${rawAmount.toFixed(2)} payment securely via Stripe.`,
        instructions: 'Please open this link to proceed with payment. Your account will be updated once payment is confirmed.',
      }
    }

    case 'get_work_orders': {
      const where: { submittedById: string; status?: WorkOrderStatus } = { submittedById: userId }
      const validStatuses = Object.values(WorkOrderStatus)
      if (typeof input.status === 'string' && validStatuses.includes(input.status as WorkOrderStatus)) {
        where.status = input.status as WorkOrderStatus
      }
      const wos = await prisma.workOrder.findMany({
        where,
        include: {
          property: { select: { name: true } },
          unit: { select: { unitNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })
      return wos.map(wo => ({
        id: wo.id,
        title: wo.title,
        status: wo.status,
        priority: wo.priority,
        category: wo.category,
        property: wo.property?.name,
        unit: wo.unit?.unitNumber,
        createdAt: new Date(wo.createdAt).toISOString().split('T')[0],
      }))
    }

    case 'submit_work_order': {
      if (typeof input.title !== 'string' || typeof input.description !== 'string') {
        return { error: 'title and description are required' }
      }
      const tenant = await prisma.tenant.findUnique({
        where: { userId },
        include: { leases: { where: { status: 'ACTIVE' }, include: { unit: true }, take: 1 } },
      })
      const activeLease = tenant?.leases[0]
      if (!activeLease) return { error: 'No active lease found' }
      const validCategories = ['PLUMBING', 'HVAC', 'ELECTRICAL', 'GENERAL', 'TURNOVER', 'OTHER']
      const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']
      const category =
        typeof input.category === 'string' && validCategories.includes(input.category)
          ? input.category
          : 'GENERAL'
      const priority =
        typeof input.priority === 'string' && validPriorities.includes(input.priority)
          ? input.priority
          : 'MEDIUM'
      const wo = await prisma.workOrder.create({
        data: {
          propertyId: activeLease.unit.propertyId,
          unitId: activeLease.unitId,
          submittedById: userId,
          title: input.title as string,
          description: input.description as string,
          category: category as any,
          priority: priority as any,
          status: 'NEW',
        },
      })
      return { success: true, workOrderId: wo.id, title: wo.title, status: wo.status, priority: wo.priority }
    }

    case 'get_renewal_offers': {
      if (!leaseId) return { leaseId: null, offers: [] }
      const offers = await prisma.leaseRenewalOffer.findMany({
        where: { leaseId },
        orderBy: { createdAt: 'desc' },
      })
      return {
        leaseId,
        offers: offers.map(o => ({
          id: o.id,
          offeredRent: o.offeredRent,
          termMonths: o.termMonths,
          offerDate: new Date(o.offerDate).toISOString().split('T')[0],
          expiryDate: new Date(o.expiryDate).toISOString().split('T')[0],
          status: o.status,
        })),
      }
    }

    case 'accept_renewal_offer': {
      const offerId = typeof input.offerId === 'string' ? input.offerId : null
      if (!offerId) return { error: 'offerId is required' }
      const offer = await prisma.leaseRenewalOffer.findUnique({
        where: { id: offerId },
        include: { lease: { select: { id: true, endDate: true, tenant: { include: { user: { select: { id: true } } } }, unit: { include: { property: { select: { name: true, managerId: true } } } } } } },
      })
      if (!offer) return { error: 'Offer not found' }
      if (offer.lease.tenant.user.id !== userId) return { error: 'Unauthorized' }
      if (offer.status !== 'PENDING') return { error: `Offer is already ${offer.status}` }

      await prisma.leaseRenewalOffer.update({ where: { id: offerId }, data: { status: 'ACCEPTED', respondedAt: new Date() } })
      const newEndDate = new Date(offer.lease.endDate)
      newEndDate.setMonth(newEndDate.getMonth() + offer.termMonths)
      await prisma.lease.update({ where: { id: offer.lease.id }, data: { endDate: newEndDate, monthlyRent: offer.offeredRent } })

      const managerId = offer.lease.unit?.property?.managerId
      const propertyName = offer.lease.unit?.property?.name ?? 'Property'
      if (managerId) {
        const { deliverNotification } = await import('@/lib/deliver')
        await deliverNotification({
          userId: managerId,
          title: 'Renewal offer accepted',
          body: `Tenant accepted the renewal offer for ${propertyName}. Lease extended to ${newEndDate.toLocaleDateString()}.`,
          type: 'GENERAL',
          entityType: 'LeaseRenewalOffer',
          entityId: offerId,
        })
      }
      return { success: true, newEndDate: newEndDate.toISOString().split('T')[0], newRent: offer.offeredRent }
    }

    case 'request_renewal': {
      if (!leaseId) return { error: 'No active lease found' }
      const termMonths = typeof input.termMonths === 'number' ? input.termMonths : null
      if (!termMonths || termMonths <= 0) return { error: 'termMonths must be a positive number' }
      const lease = await prisma.lease.findUnique({
        where: { id: leaseId },
        include: { unit: { include: { property: { select: { name: true, managerId: true } } } } },
      })
      if (!lease) return { error: 'Lease not found' }
      const expiryDate = new Date()
      expiryDate.setDate(expiryDate.getDate() + 14)
      const offer = await prisma.leaseRenewalOffer.create({
        data: {
          leaseId,
          offeredRent: lease.monthlyRent,
          termMonths,
          expiryDate,
          notes: typeof input.notes === 'string' ? input.notes : null,
          status: 'PENDING',
        },
      })
      const managerId = lease.unit?.property?.managerId
      const propertyName = lease.unit?.property?.name ?? 'Property'
      if (managerId) {
        const { deliverNotification } = await import('@/lib/deliver')
        await deliverNotification({
          userId: managerId,
          title: 'Tenant Renewal Request',
          body: `Tenant is requesting a ${termMonths}-month lease renewal for ${propertyName}.`,
          type: 'GENERAL',
          entityType: 'LeaseRenewalOffer',
          entityId: offer.id,
        })
      }
      return { success: true, offerId: offer.id, termMonths, message: 'Renewal request sent to your manager.' }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rate = await checkRateLimit({
    bucket: 'ai-chat',
    key: resolveRateLimitKey(req, session.user.id),
    limit: 40,
    windowMs: 60_000,
  })
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please retry shortly.' },
      { status: 429, headers: rateLimitHeaders(rate) }
    )
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503, headers: rateLimitHeaders(rate) })
  }

  const { messages } = await req.json()
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array required' }, { status: 400, headers: rateLimitHeaders(rate) })
  }

  // ── Tenant: agentic loop with tools ────────────────────────────────────────
  if (session.user.systemRole === 'TENANT') {
    const tenant = await prisma.tenant.findUnique({
      where: { userId: session.user.id },
      include: {
        leases: {
          where: { status: 'ACTIVE' },
          include: {
            unit: { include: { property: { select: { name: true } } } },
            ledgerEntries: { select: { amount: true } },
          },
          take: 1,
        },
      },
    })

    const activeLease = tenant?.leases[0] ?? null
    const balance = activeLease ? activeLease.ledgerEntries.reduce((sum, e) => sum + e.amount, 0) : 0

    const systemPrompt = `You are a friendly, capable AI assistant for ${session.user.name ?? 'the tenant'}, who rents Unit ${activeLease?.unit.unitNumber ?? 'N/A'} at ${activeLease?.unit.property.name ?? 'their property'}.

Current snapshot (may be stale — use tools for live data):
- Monthly Rent: $${activeLease?.monthlyRent?.toFixed(2) ?? 'N/A'}
- Lease Ends: ${activeLease ? new Date(activeLease.endDate).toLocaleDateString() : 'N/A'}
- Balance: $${Math.abs(balance).toFixed(2)} ${balance >= 0 ? 'owed' : 'credit'}

You have tools to take real actions:
• get_my_lease — full lease details
• get_payment_history — live balance + transaction list
• make_payment — record a rent payment (confirm amount first)
• get_work_orders — list their maintenance requests
• submit_work_order — create a new maintenance request (confirm details first)
• get_renewal_offers — check for pending renewal offers (includes leaseId for other tools)
• accept_renewal_offer — accept a pending renewal offer, extending the lease (confirm with tenant first)
• request_renewal — submit a renewal request to the manager when no offer exists (ask for preferred term first)

Guidelines:
- For payments, work order submissions, and lease actions, briefly confirm the key details before calling the tool.
- Be concise and conversational. Avoid unnecessary filler.
- When you complete an action (payment made, work order submitted, renewal accepted/requested), confirm clearly with the result.
- If there's no active lease, explain you cannot access their data.`

    const apiMessages: Anthropic.MessageParam[] = messages.map(
      (m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }),
    )

    // Agentic loop — max 8 iterations to prevent runaway
    for (let i = 0; i < 8; i++) {
      const response = await anthropic.messages.create({
        model: AI_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        tools: TENANT_TOOLS,
        messages: apiMessages,
      })

      if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
        const textBlock = response.content.find(b => b.type === 'text')
        const text =
          textBlock?.type === 'text' ? textBlock.text : "I'm sorry, I couldn't generate a response."
        const readable = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(text))
            controller.close()
          },
        })
        return new Response(readable, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      }

      if (response.stop_reason === 'tool_use') {
        // Append assistant message with tool use blocks
        apiMessages.push({ role: 'assistant', content: response.content })

        // Execute each tool and collect results
        const toolResults: any[] = []
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            const result = await executeTool(
              block.name,
              block.input as Record<string, unknown>,
              session.user.id,
              activeLease?.id ?? null,
            )
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            })
          }
        }

        apiMessages.push({ role: 'user', content: toolResults })
      } else {
        break
      }
    }

    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 })
  }

  // ── Manager/Admin: agentic loop with portfolio tools ──────────────────────
  const managerUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true },
  })

  const MANAGER_TOOLS: Anthropic.Tool[] = [
    {
      name: 'get_portfolio_overview',
      description: 'Get an overview of all managed properties: unit counts, open work order counts, and pending agent action counts.',
      input_schema: { type: 'object' },
    },
    {
      name: 'get_agent_inbox',
      description: 'Get the agent action inbox. Optionally filter by status.',
      input_schema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Optional filter: PENDING_APPROVAL, AUTO_EXECUTED, APPROVED, REJECTED, FAILED',
          },
        },
      },
    },
    {
      name: 'run_agent',
      description: "Run the AI agent for the manager's portfolio. It will analyze properties and queue or auto-execute actions.",
      input_schema: { type: 'object' },
    },
    {
      name: 'approve_agent_action',
      description: 'Approve a pending agent action by its ID, executing it immediately.',
      input_schema: {
        type: 'object',
        properties: {
          actionId: { type: 'string', description: 'The ID of the AgentAction to approve' },
        },
        required: ['actionId'],
      },
    },
    {
      name: 'get_unread_messages',
      description: "Get open message threads where the last message was sent by the tenant (not the manager), indicating messages needing a reply.",
      input_schema: { type: 'object' },
    },
  ]

  async function executeManagerTool(name: string, input: Record<string, unknown>) {
    const managerId = session!.user.id

    switch (name) {
      case 'get_portfolio_overview': {
        const props = await prisma.property.findMany({
          where: { managerId },
          include: {
            _count: {
              select: {
                units: true,
                workOrders: { where: { status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED'] } } },
                agentActions: { where: { status: 'PENDING_APPROVAL' } },
              },
            },
          },
        })
        return props.map(p => ({
          id: p.id,
          name: p.name,
          totalUnits: p._count.units,
          openWorkOrders: p._count.workOrders,
          pendingAgentActions: p._count.agentActions,
        }))
      }

      case 'get_agent_inbox': {
        const validStatuses = ['PENDING_APPROVAL', 'AUTO_EXECUTED', 'APPROVED', 'REJECTED', 'FAILED']
        const statusFilter =
          typeof input.status === 'string' && validStatuses.includes(input.status)
            ? input.status
            : undefined
        const actions = await prisma.agentAction.findMany({
          where: {
            managerId,
            ...(statusFilter && { status: statusFilter as any }),
          },
          include: { property: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
        return actions
      }

      case 'run_agent': {
        const result = await runAgentForManager(managerId)
        return { ok: true, ...result }
      }

      case 'approve_agent_action': {
        const actionId = typeof input.actionId === 'string' ? input.actionId : null
        if (!actionId) return { error: 'actionId is required' }
        const action = await prisma.agentAction.findUnique({ where: { id: actionId } })
        if (!action) return { error: 'Action not found' }
        if (action.managerId !== managerId) return { error: 'Forbidden' }
        if (action.status !== 'PENDING_APPROVAL') return { error: `Action is already ${action.status}` }
        const actionLock = await acquireActionExecutionLock(actionId)
        if (!actionLock) return { error: 'Action is already being handled' }
        try {
          const claimAt = new Date()
          const claim = await prisma.agentAction.updateMany({
            where: {
              id: actionId,
              managerId,
              status: 'PENDING_APPROVAL',
              respondedAt: null,
            },
            data: {
              respondedAt: claimAt,
              result: { processing: true, claimAt: claimAt.toISOString() } as any,
            },
          })
          if (claim.count !== 1) return { error: 'Action is already being handled' }

          let execResult: any
          try {
            execResult = await executeAction(action, managerId)
          } catch (err: any) {
            execResult = { ok: false, error: err?.message ?? 'Execution failed' }
          }

          await prisma.agentAction.updateMany({
            where: {
              id: actionId,
              managerId,
              status: 'PENDING_APPROVAL',
              respondedAt: claimAt,
            },
            data: {
              status: execResult.ok ? 'APPROVED' : 'FAILED',
              result: execResult as any,
              executedAt: new Date(),
            },
          })

          return { actionId, ...execResult }
        } finally {
          await releaseActionExecutionLock(actionLock)
        }
      }

      case 'get_unread_messages': {
        const threads = await prisma.messageThread.findMany({
          where: {
            status: 'OPEN',
            property: { managerId },
            messages: { some: {} },
          },
          include: {
            property: { select: { name: true } },
            tenant: { include: { user: { select: { name: true } } } },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        })
        // Filter to threads where last message is from tenant (not manager)
        const unread = threads.filter(t => {
          const last = t.messages[0]
          return last && last.authorId !== managerId
        })
        return unread.map(t => ({
          threadId: t.id,
          subject: t.subject,
          tenant: t.tenant?.user?.name ?? 'Unknown',
          property: t.property?.name,
          lastMessage: t.messages[0]?.body?.slice(0, 120),
          lastMessageAt: t.messages[0]?.createdAt,
        }))
      }

      default:
        return { error: `Unknown tool: ${name}` }
    }
  }

  const managerSystemPrompt = `You are a powerful AI assistant for property manager ${managerUser?.name ?? session.user.name ?? 'Manager'}. Use your tools to answer questions about the portfolio and take action when asked. Be concise and professional.`

  const mgApiMessages: Anthropic.MessageParam[] = messages.map(
    (m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }),
  )

  // Agentic loop — max 8 iterations
  for (let i = 0; i < 8; i++) {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      system: managerSystemPrompt,
      tools: MANAGER_TOOLS,
      messages: mgApiMessages,
    })

    if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
      const textBlock = response.content.find(b => b.type === 'text')
      const text =
        textBlock?.type === 'text' ? textBlock.text : "I'm sorry, I couldn't generate a response."
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text))
          controller.close()
        },
      })
      return new Response(readable, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    }

    if (response.stop_reason === 'tool_use') {
      mgApiMessages.push({ role: 'assistant', content: response.content })
      const toolResults: any[] = []
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await executeManagerTool(block.name, block.input as Record<string, unknown>)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          })
        }
      }
      mgApiMessages.push({ role: 'user', content: toolResults })
    } else {
      break
    }
  }

  return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 })
}
