import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { workOrderScopeWhere } from '@/lib/access'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workOrder = await prisma.workOrder.findFirst({
    where: {
      id: params.id,
      ...workOrderScopeWhere(session),
    },
  })
  if (!workOrder) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (workOrder.status !== 'COMPLETED') {
    return NextResponse.json({ error: 'Work order must be COMPLETED before sign-off' }, { status: 400 })
  }
  if (workOrder.signedOffAt) {
    return NextResponse.json({ error: 'Work order already signed off' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const { signOffNotes } = body

  const updated = await prisma.workOrder.update({
    where: { id: params.id },
    data: {
      signedOffAt: new Date(),
      signedOffBy: session.user.id,
      signOffNotes: signOffNotes ?? null,
    },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'STATUS_CHANGE',
    entityType: 'WorkOrder',
    entityId: params.id,
    diff: { signedOff: true, signOffNotes: signOffNotes ?? null },
  })

  return NextResponse.json(updated)
}
