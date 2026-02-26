import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/agent/runs/[id]/cancel
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const run = await prisma.agentRun.findUnique({
    where: { id: params.id },
    select: { id: true, status: true },
  })

  if (!run) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (run.status === 'COMPLETED' || run.status === 'FAILED') {
    return NextResponse.json({ error: `Run is already ${run.status}` }, { status: 409 })
  }

  await prisma.agentRun.update({
    where: { id: params.id },
    data: { status: 'FAILED', completedAt: new Date(), error: 'Cancelled by user' },
  })

  return NextResponse.json({ ok: true })
}
