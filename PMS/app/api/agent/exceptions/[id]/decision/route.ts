import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/agent/exceptions/[id]/decision — attach a human decision payload
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { decision, notes } = body

  if (!decision) {
    return NextResponse.json({ error: 'decision is required' }, { status: 400 })
  }

  const ex = await prisma.agentException.findUnique({
    where: { id: params.id },
    select: { id: true, contextJson: true },
  })
  if (!ex) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updatedContext = {
    ...(ex.contextJson as Record<string, unknown> ?? {}),
    humanDecision: { decision, notes, decidedBy: session.user.id, decidedAt: new Date().toISOString() },
  }

  const updated = await prisma.agentException.update({
    where: { id: params.id },
    data: {
      status: 'RESOLVED',
      resolvedById: session.user.id,
      resolvedAt: new Date(),
      contextJson: updatedContext,
    },
  })

  return NextResponse.json(updated)
}
