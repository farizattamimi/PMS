import { prisma } from '@/lib/prisma'
import { canAccessScopedPropertyId, scopedPropertyIdsForManagerViews } from '@/lib/access'
import { sessionProvider } from '@/lib/session-provider'

const POLL_MS      = 2000   // poll every 2 s while run is active
const MAX_MS       = 300000 // hard cap: 5 minutes
const TERMINAL     = new Set(['COMPLETED', 'FAILED', 'ESCALATED'])

/**
 * GET /api/agent/runs/[id]/stream
 *
 * SSE stream for a single run's full detail (steps, action logs, exceptions).
 * Polls every 2 s while the run is active. Sends a final `{ run, live: false }`
 * message when the run reaches a terminal state, then closes.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return new Response('Unauthorized', { status: 401 })
  }
  const scopedPropertyIds = await scopedPropertyIdsForManagerViews(session)

  const runId = params.id
  const encoder = new TextEncoder()

  async function fetchRun() {
    const run = await prisma.agentRun.findUnique({
      where: { id: runId },
      include: {
        steps:      { orderBy: { stepOrder: 'asc' } },
        actionLogs: { orderBy: { createdAt: 'asc' } },
        exceptions: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!run) return null
    if (!canAccessScopedPropertyId(scopedPropertyIds, run.propertyId)) return null
    return run
  }

  let timer: ReturnType<typeof setInterval> | null = null
  let closeTimer: ReturnType<typeof setTimeout> | null = null
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        if (closed) return
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          )
        } catch {
          closed = true
        }
      }

      const close = () => {
        if (closed) return
        closed = true
        if (timer) clearInterval(timer)
        if (closeTimer) clearTimeout(closeTimer)
        try { controller.close() } catch {}
      }

      // Send initial state immediately
      const initial = await fetchRun()
      if (!initial) { close(); return }

      const isTerminal = TERMINAL.has(initial.status)
      send({ run: initial, live: !isTerminal })
      if (isTerminal) { close(); return }

      // Poll while run is active
      timer = setInterval(async () => {
        const run = await fetchRun()
        if (!run || closed) { close(); return }

        const terminal = TERMINAL.has(run.status)
        send({ run, live: !terminal })
        if (terminal) close()
      }, POLL_MS)

      // Hard cap
      closeTimer = setTimeout(close, MAX_MS)
    },

    cancel() {
      closed = true
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
