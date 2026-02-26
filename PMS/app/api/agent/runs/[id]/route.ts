import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/agent/runs/[id] — full run detail with steps + action logs + exceptions
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const run = await prisma.agentRun.findUnique({
    where: { id: params.id },
    include: {
      steps: { orderBy: { stepOrder: 'asc' } },
      actionLogs: { orderBy: { createdAt: 'asc' } },
      exceptions: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!run) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(run)
}
