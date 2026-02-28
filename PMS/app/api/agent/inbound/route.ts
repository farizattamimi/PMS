import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateCronSecret } from '@/lib/security'
import { verifyHmacSha256Signature } from '@/lib/webhook-signature'
import { enqueueWorkflowRun } from '@/lib/agent-orchestrator'

type InboundChannel = 'EMAIL' | 'SMS' | 'VOICE'

function verifyInboundAuth(req: Request, rawBody: string): boolean {
  const authHeader = req.headers.get('authorization')
  const provided = authHeader?.replace('Bearer ', '')
  const cron = validateCronSecret({
    cronSecret: process.env.CRON_SECRET,
    nodeEnv: process.env.NODE_ENV,
    providedSecret: provided,
  })
  if (cron.ok) return true

  const secret = process.env.AGENT_INBOUND_HMAC_SECRET
  if (!secret) return false
  const signature = req.headers.get('x-agent-signature')
  const timestamp = req.headers.get('x-agent-timestamp')
  if (!timestamp) return false
  return verifyHmacSha256Signature(rawBody, signature, secret, timestamp)
}

export async function POST(req: Request) {
  const rawBody = await req.text()
  if (!verifyInboundAuth(req, rawBody)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any = {}
  try {
    body = JSON.parse(rawBody || '{}')
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }
  const channel = String(body.channel ?? '').toUpperCase() as InboundChannel
  const propertyId = typeof body.propertyId === 'string' ? body.propertyId : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const tenantUserId = typeof body.tenantUserId === 'string' ? body.tenantUserId : ''
  const threadIdInput = typeof body.threadId === 'string' ? body.threadId : ''
  const subject = typeof body.subject === 'string' && body.subject.trim().length > 0 ? body.subject.trim() : `${channel} inbound message`

  if (!['EMAIL', 'SMS', 'VOICE'].includes(channel)) {
    return NextResponse.json({ error: 'channel must be EMAIL, SMS, or VOICE' }, { status: 400 })
  }
  if (!propertyId || !tenantUserId || !message) {
    return NextResponse.json({ error: 'propertyId, tenantUserId, and message are required' }, { status: 400 })
  }

  const tenant = await prisma.tenant.findFirst({
    where: {
      userId: tenantUserId,
      OR: [
        { propertyId },
        { leases: { some: { propertyId } } },
      ],
    },
    select: { id: true },
  })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found in property scope' }, { status: 404 })

  let threadId = threadIdInput
  if (threadId) {
    const thread = await prisma.messageThread.findFirst({
      where: { id: threadId, propertyId, tenantId: tenant.id },
      select: { id: true },
    })
    if (!thread) return NextResponse.json({ error: 'Thread not found in scope' }, { status: 404 })
  } else {
    const thread = await prisma.messageThread.create({
      data: {
        propertyId,
        tenantId: tenant.id,
        subject,
      },
      select: { id: true },
    })
    threadId = thread.id
  }

  await prisma.message.create({
    data: {
      threadId,
      authorId: tenantUserId,
      body: `[${channel}] ${message}`,
    },
  })

  const runId = await enqueueWorkflowRun({
    workflowType: 'TENANT_COMMS',
    triggerType: 'inbound',
    triggerRef: `inbound-${channel}-${threadId}-${Date.now()}`,
    propertyId,
    payload: { propertyId, threadId, channel, sourceRef: body.sourceRef ?? null },
    maxAttempts: 5,
  })

  return NextResponse.json({ ok: true, runId, threadId })
}
