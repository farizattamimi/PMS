import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyHmacSha256Signature } from '@/lib/webhook-signature'
import { consumeReplayEvent } from '@/lib/webhook-replay-cache'

function validateBearerSecret(req: Request): boolean {
  const secret = process.env.SCREENING_WEBHOOK_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

export async function POST(req: Request) {
  const rawBody = await req.text()

  const hmacSecret = process.env.SCREENING_WEBHOOK_HMAC_SECRET
  if (hmacSecret) {
    const signature = req.headers.get('x-screening-signature')
    const timestamp = req.headers.get('x-screening-timestamp')
    if (!timestamp) {
      return NextResponse.json({ error: 'Missing timestamp' }, { status: 401 })
    }
    if (!verifyHmacSha256Signature(rawBody, signature, hmacSecret, timestamp)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  } else if (!validateBearerSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any = {}
  try {
    body = JSON.parse(rawBody || '{}')
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }
  const eventId = req.headers.get('x-screening-event-id')?.trim()
  if (!eventId) {
    return NextResponse.json({ error: 'x-screening-event-id required' }, { status: 400 })
  }

  const replay = await consumeReplayEvent('screening-webhook', eventId, 10 * 60)
  if (replay === 'duplicate') {
    return NextResponse.json({ error: 'Duplicate event' }, { status: 409 })
  }
  if (replay === 'unavailable') {
    return NextResponse.json({ error: 'Replay protection unavailable' }, { status: 503 })
  }

  const { providerRef, creditScore, creditStatus, creditNotes, backgroundStatus, backgroundNotes,
    evictionStatus, evictionNotes, incomeVerified, incomeRatio, incomeStatus, incomeNotes,
    overallStatus } = body

  if (!providerRef) {
    return NextResponse.json({ error: 'providerRef required' }, { status: 400 })
  }

  const report = await prisma.screeningReport.findFirst({
    where: { providerRef },
  })

  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  const data: any = { completedAt: new Date() }
  if (creditScore !== undefined) data.creditScore = creditScore
  if (creditStatus !== undefined) data.creditStatus = creditStatus
  if (creditNotes !== undefined) data.creditNotes = creditNotes
  if (backgroundStatus !== undefined) data.backgroundStatus = backgroundStatus
  if (backgroundNotes !== undefined) data.backgroundNotes = backgroundNotes
  if (evictionStatus !== undefined) data.evictionStatus = evictionStatus
  if (evictionNotes !== undefined) data.evictionNotes = evictionNotes
  if (incomeVerified !== undefined) data.incomeVerified = incomeVerified
  if (incomeRatio !== undefined) data.incomeRatio = incomeRatio
  if (incomeStatus !== undefined) data.incomeStatus = incomeStatus
  if (incomeNotes !== undefined) data.incomeNotes = incomeNotes
  if (overallStatus !== undefined) data.overallStatus = overallStatus

  await prisma.screeningReport.update({
    where: { id: report.id },
    data,
  })

  return NextResponse.json({ received: true })
}
