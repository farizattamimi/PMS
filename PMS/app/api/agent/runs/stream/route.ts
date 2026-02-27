import { prisma } from '@/lib/prisma'
import { scopedPropertyIdFilter, scopedPropertyIdsForManagerViews } from '@/lib/access'
import { sessionProvider } from '@/lib/session-provider'

const POLL_MS = 3000   // poll DB every 3 seconds
const MAX_MS  = 90000  // close after 90 s (client auto-reconnects)

/**
 * GET /api/agent/runs/stream
 *
 * SSE stream that pushes AgentRun list updates to the client in real time.
 * The client should open this with `new EventSource(url)` and reconnect
 * automatically on close (browsers do this by default).
 *
 * Query params:
 *   status     — filter by run status (optional)
 *   propertyId — filter by property (optional)
 */
export async function GET(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole === 'TENANT') {
    return new Response('Unauthorized', { status: 401 })
  }
  const scopedPropertyIds = await scopedPropertyIdsForManagerViews(session)

  const { searchParams } = new URL(req.url)
  const status     = searchParams.get('status') ?? undefined
  const propertyId = searchParams.get('propertyId') ?? undefined

  const encoder = new TextEncoder()

  async function fetchRuns() {
    const where: Record<string, unknown> = {}
    if (status)     where.status     = status
    const propertyFilter = scopedPropertyIdFilter(scopedPropertyIds, propertyId)
    if (propertyFilter !== undefined) where.propertyId = propertyFilter

    return prisma.agentRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { _count: { select: { steps: true, exceptions: true } } },
    })
  }

  let timer: ReturnType<typeof setInterval> | null = null
  let closeTimer: ReturnType<typeof setTimeout> | null = null

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          )
        } catch {
          // controller already closed
        }
      }

      // Send immediately on connect
      send({ runs: await fetchRuns(), ts: Date.now() })

      // Then poll on interval
      timer = setInterval(async () => {
        send({ runs: await fetchRuns(), ts: Date.now() })
      }, POLL_MS)

      // Auto-close after MAX_MS to prevent stale connections
      closeTimer = setTimeout(() => {
        if (timer) clearInterval(timer)
        try { controller.close() } catch {}
      }, MAX_MS)
    },

    cancel() {
      if (timer) clearInterval(timer)
      if (closeTimer) clearTimeout(closeTimer)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
