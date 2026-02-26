import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { executeAction } from '@/lib/agent'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const action = await prisma.agentAction.findUnique({ where: { id: params.id } })
  if (!action) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (action.managerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (action.status !== 'PENDING_APPROVAL') {
    return NextResponse.json({ error: `Action is already ${action.status}` }, { status: 409 })
  }

  const execResult = await executeAction(action, session.user.id)

  const updated = await prisma.agentAction.update({
    where: { id: params.id },
    data: {
      status: execResult.ok ? 'APPROVED' : 'FAILED',
      result: execResult as any,
      executedAt: new Date(),
      respondedAt: new Date(),
    },
  })

  return NextResponse.json(updated)
}
