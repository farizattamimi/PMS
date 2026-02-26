// lib/workflows/tenant-comms-autopilot.ts
// Workflow B: Tenant Comms Autopilot
// Trigger: NEW_MESSAGE_THREAD or NEW_MESSAGE from a tenant

import { prisma } from '../prisma'
import { createNotification } from '../notify'
import { evaluateAction } from '../policy-engine'
import { anthropic, AI_MODEL } from '../ai'
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

interface TriggerData {
  runId: string
  propertyId: string
  threadId: string
}

type Intent =
  | 'MAINTENANCE_INTAKE'
  | 'BILLING'
  | 'LEASE_INFO'
  | 'FAQ'
  | 'RENEWAL_INFO'
  | 'STATUS_UPDATE'
  | 'COMPLAINT'
  | 'LEGAL'
  | 'HARASSMENT'
  | 'OTHER'

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

export async function runTenantCommsAutopilot(data: TriggerData): Promise<void> {
  const { runId, propertyId, threadId } = data
  let escalated = false

  try {
    await startRun(runId)

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Load context
    // ─────────────────────────────────────────────────────────────────────────
    const s1 = await addStep(runId, {
      stepOrder: 1,
      name: 'Load Thread Context',
      inputJson: { threadId },
    })
    await startStep(s1)

    const thread = await prisma.messageThread.findUnique({
      where: { id: threadId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        tenant: {
          include: { user: { select: { id: true, name: true } } },
        },
        property: {
          select: { id: true, name: true, managerId: true },
        },
      },
    })

    if (!thread) {
      await failStep(s1, `Thread ${threadId} not found`)
      await failRun(runId, `Thread ${threadId} not found`)
      return
    }

    // Find the most recent tenant message
    const tenantUserId = thread.tenant.user.id
    const latestTenantMessage = thread.messages.find(
      (m) => m.authorId === tenantUserId
    )

    if (!latestTenantMessage) {
      await completeStep(s1, { skipped: true, reason: 'No tenant message found in thread' })
      await completeRun(runId, 'No tenant message to process — skipping')
      return
    }

    const subject = thread.subject
    const messageBody = latestTenantMessage.body
    const managerId = thread.property.managerId

    await completeStep(s1, {
      threadId,
      subject,
      messagePreview: messageBody.slice(0, 80),
      managerId,
    })

    // Load policy
    const policy = await loadPolicyForProperty(propertyId)

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Classify intent
    // ─────────────────────────────────────────────────────────────────────────
    const s2 = await addStep(runId, {
      stepOrder: 2,
      name: 'Classify Message Intent',
      inputJson: { subject, messagePreview: messageBody.slice(0, 200) },
    })
    await startStep(s2)

    // Quick local check for legal keywords before API call
    const bodyLower = messageBody.toLowerCase()
    const localLegalHit = LEGAL_KEYWORDS.some((kw) => bodyLower.includes(kw))

    let intent: Intent = 'OTHER'
    let hasLegalKeywords = localLegalHit

    try {
      const classifyResponse = await anthropic.messages.create({
        model: AI_MODEL,
        max_tokens: 256,
        system: `You are a property management AI. Classify the tenant message into exactly one of these intents:
MAINTENANCE_INTAKE, BILLING, LEASE_INFO, FAQ, RENEWAL_INFO, STATUS_UPDATE, COMPLAINT, LEGAL, HARASSMENT, OTHER

Also check if the message contains legal keywords: lawsuit, sue, attorney, lawyer, legal action, discrimination, harassment, eviction notice, habitability, uninhabitable, breach of contract, negligence, personal injury, threat, threatening, mold, retaliation.

Respond ONLY with valid JSON: { "intent": "INTENT_HERE", "hasLegalKeywords": true/false }`,
        messages: [
          {
            role: 'user',
            content: `Subject: ${subject}\n\nMessage: ${messageBody}`,
          },
        ],
      })

      const rawText =
        classifyResponse.content[0]?.type === 'text'
          ? classifyResponse.content[0].text.trim()
          : ''

      // Strip markdown code fences if present
      const jsonText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

      const parsed = JSON.parse(jsonText) as { intent: string; hasLegalKeywords: boolean }
      const validIntents: Intent[] = [
        'MAINTENANCE_INTAKE',
        'BILLING',
        'LEASE_INFO',
        'FAQ',
        'RENEWAL_INFO',
        'STATUS_UPDATE',
        'COMPLAINT',
        'LEGAL',
        'HARASSMENT',
        'OTHER',
      ]
      if (validIntents.includes(parsed.intent as Intent)) {
        intent = parsed.intent as Intent
      }
      hasLegalKeywords = hasLegalKeywords || parsed.hasLegalKeywords
    } catch {
      // Parse error or API error — fall back to OTHER
      intent = 'OTHER'
    }

    await completeStep(s2, { intent, hasLegalKeywords })

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Policy check
    // ─────────────────────────────────────────────────────────────────────────
    const s3 = await addStep(runId, {
      stepOrder: 3,
      name: 'Policy: MESSAGE_SEND',
      inputJson: { intent, hasLegalKeywords },
    })
    await startStep(s3)

    const policyResult = evaluateAction(
      { actionType: 'MESSAGE_SEND', context: { intent, hasLegalKeywords } },
      policy
    )
    await logAction({
      runId,
      stepId: s3,
      actionType: 'DECISION',
      target: 'MESSAGE_SEND',
      policyDecision: policyResult.decision,
      policyReason: policyResult.reason,
    })
    await completeStep(s3, { decision: policyResult.decision, reason: policyResult.reason })

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Act on policy decision
    // ─────────────────────────────────────────────────────────────────────────

    if (policyResult.decision === 'BLOCK') {
      // 4A: Legal / harassment — block and escalate
      escalated = await handleBlock({
        runId,
        propertyId,
        threadId,
        managerId,
        intent,
        hasLegalKeywords,
        messageBody,
        subject,
      })
    } else if (policyResult.decision === 'APPROVAL') {
      // 4B: Needs manager review — generate draft and escalate
      escalated = await handleApproval({
        runId,
        propertyId,
        threadId,
        managerId,
        intent,
        messageBody,
        subject,
        policyReason: policyResult.reason,
      })
    } else {
      // 4C: ALLOW — auto-respond
      escalated = await handleAllow({
        runId,
        propertyId,
        threadId,
        managerId,
        tenantUserId,
        intent,
        messageBody,
        subject,
      })
    }

    if (escalated) {
      await escalateRun(runId, 'Tenant comms workflow completed with escalation')
    } else {
      await completeRun(runId, 'Tenant comms autopilot completed — reply sent')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await failRun(runId, message).catch(() => {})
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4A: BLOCK — legal/harassment content
// ─────────────────────────────────────────────────────────────────────────────

async function handleBlock(opts: {
  runId: string
  propertyId: string
  threadId: string
  managerId: string
  intent: Intent
  hasLegalKeywords: boolean
  messageBody: string
  subject: string
}): Promise<boolean> {
  const stepId = await addStep(opts.runId, {
    stepOrder: 4,
    name: 'Escalate: Legal/Policy Block',
    inputJson: { intent: opts.intent, hasLegalKeywords: opts.hasLegalKeywords },
  })
  await startStep(stepId)

  const isLegal = opts.hasLegalKeywords || opts.intent === 'LEGAL'
  const isHarassment = opts.intent === 'HARASSMENT'

  await createException({
    runId: opts.runId,
    propertyId: opts.propertyId,
    severity: 'CRITICAL',
    category: 'LEGAL',
    title: isHarassment
      ? `Harassment detected in tenant message — thread: ${opts.subject}`
      : `Legal content detected in tenant message — thread: ${opts.subject}`,
    details: isLegal
      ? `Message contains legal keywords or legal intent. Requires attorney review before any response is sent. Thread ID: ${opts.threadId}`
      : `Message flagged for harassment. Requires manager review. Thread ID: ${opts.threadId}`,
    contextJson: {
      threadId: opts.threadId,
      intent: opts.intent,
      hasLegalKeywords: opts.hasLegalKeywords,
      messagePreview: opts.messageBody.slice(0, 200),
    },
    requiresBy: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours
  })

  // Notify manager
  await createNotification({
    userId: opts.managerId,
    title: isHarassment
      ? 'URGENT: Tenant message flagged for harassment'
      : 'URGENT: Tenant message contains legal content',
    body: `Thread "${opts.subject}" requires immediate review. No automated response was sent. Check Agent Exceptions.`,
    type: 'AGENT_ACTION',
    entityType: 'MessageThread',
    entityId: opts.threadId,
  })

  await completeStep(stepId, { escalated: true, reason: 'BLOCK' })
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// 4B: APPROVAL — generate draft, await manager review
// ─────────────────────────────────────────────────────────────────────────────

async function handleApproval(opts: {
  runId: string
  propertyId: string
  threadId: string
  managerId: string
  intent: Intent
  messageBody: string
  subject: string
  policyReason: string
}): Promise<boolean> {
  const stepId = await addStep(opts.runId, {
    stepOrder: 4,
    name: 'Generate Draft + Escalate for Review',
    inputJson: { intent: opts.intent, reason: opts.policyReason },
  })
  await startStep(stepId)

  let draft = ''
  try {
    const draftResponse = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 512,
      system: `You are a property manager assistant. Draft a professional, empathetic reply to the tenant message below.
Intent detected: ${opts.intent}. Keep it under 150 words. Do not make specific commitments about timelines unless you are certain.`,
      messages: [
        {
          role: 'user',
          content: `Tenant message (subject: ${opts.subject}):\n${opts.messageBody}\n\nDraft a reply for the manager to review and send.`,
        },
      ],
    })
    if (draftResponse.content[0]?.type === 'text') {
      draft = draftResponse.content[0].text.trim()
    }
  } catch {
    draft = `Thank you for reaching out. A member of our team will be in touch shortly regarding: "${opts.subject}".`
  }

  await logAction({
    runId: opts.runId,
    stepId,
    actionType: 'API_CALL',
    target: 'anthropic.messages.create (draft)',
    responseJson: { draftLength: draft.length },
  })

  await createException({
    runId: opts.runId,
    propertyId: opts.propertyId,
    severity: 'MEDIUM',
    category: 'SYSTEM',
    title: `Auto-reply pending review — "${opts.subject}"`,
    details: opts.policyReason,
    contextJson: {
      threadId: opts.threadId,
      intent: opts.intent,
      draft,
    },
  })

  await createNotification({
    userId: opts.managerId,
    title: `Draft reply awaiting your review — ${opts.subject}`,
    body: `Intent: ${opts.intent}. Draft: ${draft.slice(0, 120)}…`,
    type: 'AGENT_ACTION',
    entityType: 'MessageThread',
    entityId: opts.threadId,
  })

  await completeStep(stepId, { escalated: true, draftLength: draft.length })
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// 4C: ALLOW — auto-respond
// ─────────────────────────────────────────────────────────────────────────────

async function handleAllow(opts: {
  runId: string
  propertyId: string
  threadId: string
  managerId: string
  tenantUserId: string
  intent: Intent
  messageBody: string
  subject: string
}): Promise<boolean> {
  const stepId = await addStep(opts.runId, {
    stepOrder: 4,
    name: 'Generate & Send Auto-Reply',
    inputJson: { intent: opts.intent },
  })
  await startStep(stepId)

  let escalated = false

  // Load relevant context for grounding
  let contextBlock = ''
  try {
    contextBlock = await buildContextBlock(opts.propertyId, opts.tenantUserId)
  } catch {
    // non-fatal
  }

  // For COMPLAINT intent, still send reply but also escalate
  const isComplaint = opts.intent === 'COMPLAINT'

  // Generate the reply
  const intentPrompt = buildIntentPrompt(opts.intent)
  let replyBody = ''
  let newWorkOrderId: string | null = null

  try {
    if (opts.intent === 'MAINTENANCE_INTAKE') {
      // Create a work order directly
      try {
        const wo = await prisma.workOrder.create({
          data: {
            propertyId: opts.propertyId,
            submittedById: opts.managerId,
            title: `Tenant Request: ${opts.subject}`,
            description: opts.messageBody,
            category: 'GENERAL',
            priority: 'MEDIUM',
            status: 'NEW',
          },
          select: { id: true },
        })
        newWorkOrderId = wo.id
        await logAction({
          runId: opts.runId,
          stepId,
          actionType: 'API_CALL',
          target: 'prisma.workOrder.create',
          responseJson: { workOrderId: wo.id },
        })
      } catch (woErr) {
        // Log but don't fail the whole step
        console.error('[TenantComms] WO create error:', woErr)
      }
    }

    const aiResponse = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 512,
      system: `You are a professional property management assistant. Write a concise, empathetic reply to the tenant.
Intent: ${opts.intent}
${intentPrompt}
${contextBlock ? `\nContext:\n${contextBlock}` : ''}
${newWorkOrderId ? `\nA work order has already been created (ID: ${newWorkOrderId}). Tell the tenant their request has been logged and will be addressed.` : ''}
Keep the reply under 150 words. Be helpful and professional.`,
      messages: [
        {
          role: 'user',
          content: `Tenant message (subject: ${opts.subject}):\n${opts.messageBody}`,
        },
      ],
    })

    if (aiResponse.content[0]?.type === 'text') {
      replyBody = aiResponse.content[0].text.trim()
    }
  } catch {
    replyBody = `Thank you for your message. We've received your inquiry and will follow up shortly.`
  }

  const finalBody = `[Automated Response]\n\n${replyBody}`

  // Post reply to thread
  try {
    await prisma.message.create({
      data: {
        threadId: opts.threadId,
        authorId: opts.managerId,
        body: finalBody,
      },
    })
    await prisma.messageThread.update({
      where: { id: opts.threadId },
      data: { updatedAt: new Date() },
    })
  } catch (msgErr) {
    const errMsg = msgErr instanceof Error ? msgErr.message : String(msgErr)
    await failStep(stepId, `Failed to post reply: ${errMsg}`)
    return false
  }

  await logAction({
    runId: opts.runId,
    stepId,
    actionType: 'API_CALL',
    target: 'prisma.message.create',
    responseJson: { threadId: opts.threadId, replyLength: finalBody.length },
  })

  // Notify tenant
  await createNotification({
    userId: opts.tenantUserId,
    title: 'New message from your property management team',
    body: replyBody.slice(0, 100),
    type: 'GENERAL',
    entityType: 'MessageThread',
    entityId: opts.threadId,
  })

  // Notify manager with summary
  await createNotification({
    userId: opts.managerId,
    title: `Agent: Auto-reply sent — ${opts.subject}`,
    body: `Intent: ${opts.intent}. Reply sent to tenant.${newWorkOrderId ? ' Work order created.' : ''}`,
    type: 'AGENT_ACTION',
    entityType: 'MessageThread',
    entityId: opts.threadId,
  })

  // For COMPLAINT: also create a medium exception for visibility
  if (isComplaint) {
    await createException({
      runId: opts.runId,
      propertyId: opts.propertyId,
      severity: 'MEDIUM',
      category: 'SYSTEM',
      title: `Tenant complaint received — ${opts.subject}`,
      details: `Auto-reply was sent but complaint requires follow-up. Message: ${opts.messageBody.slice(0, 200)}`,
      contextJson: { threadId: opts.threadId },
    })
    escalated = true
  }

  await completeStep(stepId, {
    replySent: true,
    replyLength: finalBody.length,
    newWorkOrderId,
    escalated,
  })

  return escalated
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildIntentPrompt(intent: Intent): string {
  switch (intent) {
    case 'MAINTENANCE_INTAKE':
      return 'Acknowledge the maintenance request and confirm a work order was created. Provide expected response time (typically 24-48 hours for non-emergency).'
    case 'BILLING':
      return 'Address billing or payment questions professionally. Reference the tenant portal for payment history and upcoming charges.'
    case 'LEASE_INFO':
      return 'Answer lease-related questions clearly. For specific lease term changes, direct them to speak with management.'
    case 'FAQ':
      return 'Answer the general question helpfully and concisely.'
    case 'RENEWAL_INFO':
      return 'Provide information about the lease renewal process. Encourage them to use the tenant portal to view any renewal offers.'
    case 'STATUS_UPDATE':
      return 'Provide a clear status update. Be specific about what is known and when they can expect further updates.'
    case 'COMPLAINT':
      return 'Respond with genuine empathy and acknowledgment. Express commitment to addressing their concern promptly.'
    default:
      return 'Acknowledge their message and let them know a team member will follow up.'
  }
}

async function buildContextBlock(propertyId: string, tenantUserId: string): Promise<string> {
  // Find tenant record linked to this user
  const tenant = await prisma.tenant.findFirst({
    where: { userId: tenantUserId },
    select: { id: true },
  })
  if (!tenant) return ''

  const lines: string[] = []

  // Active lease
  const lease = await prisma.lease.findFirst({
    where: { tenantId: tenant.id, status: 'ACTIVE' },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      monthlyRent: true,
      unit: { select: { unitNumber: true } },
    },
  })
  if (lease) {
    lines.push(
      `Active Lease: Unit ${lease.unit.unitNumber}, $${lease.monthlyRent}/mo, ends ${lease.endDate.toISOString().slice(0, 10)}`
    )
  }

  // Recent payments (RENT entries with negative amount = payments made)
  const recentPayments = await prisma.ledgerEntry.findMany({
    where: { lease: { tenantId: tenant.id }, type: 'RENT', amount: { lt: 0 } },
    orderBy: { effectiveDate: 'desc' },
    take: 3,
    select: { amount: true, effectiveDate: true },
  })
  if (recentPayments.length > 0) {
    const payStr = recentPayments
      .map((p) => `$${Math.abs(p.amount)} on ${p.effectiveDate.toISOString().slice(0, 10)}`)
      .join(', ')
    lines.push(`Recent Payments: ${payStr}`)
  }

  // Open work orders
  const openWOs = await prisma.workOrder.findMany({
    where: {
      propertyId,
      status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS'] },
    },
    take: 3,
    select: { title: true, status: true },
  })
  if (openWOs.length > 0) {
    const woStr = openWOs.map((w) => `"${w.title}" (${w.status})`).join(', ')
    lines.push(`Open Work Orders: ${woStr}`)
  }

  return lines.join('\n')
}
