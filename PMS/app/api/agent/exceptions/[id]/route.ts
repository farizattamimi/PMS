import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/agent/exceptions/[id] — ack or resolve
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { status } = body

  if (!['ACK', 'RESOLVED'].includes(status)) {
    return NextResponse.json({ error: 'status must be ACK or RESOLVED' }, { status: 400 })
  }

  const ex = await prisma.agentException.findUnique({
    where: { id: params.id },
    select: { id: true, status: true },
  })
  if (!ex) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.agentException.update({
    where: { id: params.id },
    data: {
      status,
      resolvedById: status === 'RESOLVED' ? session.user.id : undefined,
      resolvedAt: status === 'RESOLVED' ? new Date() : undefined,
    },
  })

  return NextResponse.json(updated)
}
