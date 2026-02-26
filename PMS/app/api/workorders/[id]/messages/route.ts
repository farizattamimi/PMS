import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { workOrderScopeWhere } from '@/lib/access'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workOrder = await prisma.workOrder.findFirst({
    where: {
      id: params.id,
      ...workOrderScopeWhere(session),
    },
    select: { id: true },
  })
  if (!workOrder) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const messages = await prisma.workOrderMessage.findMany({
    where: { workOrderId: params.id },
    orderBy: { createdAt: 'asc' },
  })

  // Enrich with author names
  const authorIds = Array.from(new Set(messages.map(m => m.authorId)))
  const authors = await prisma.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, name: true },
  })
  const authorMap = new Map(authors.map(a => [a.id, a.name]))

  return NextResponse.json(messages.map(m => ({ ...m, authorName: authorMap.get(m.authorId) ?? m.authorId })))
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const workOrder = await prisma.workOrder.findFirst({
    where: {
      id: params.id,
      ...workOrderScopeWhere(session),
    },
    select: { id: true },
  })
  if (!workOrder) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { body: msgBody } = body
  if (!msgBody?.trim()) {
    return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
  }

  const message = await prisma.workOrderMessage.create({
    data: {
      workOrderId: params.id,
      authorId: session.user.id,
      body: msgBody.trim(),
    },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'WorkOrderMessage',
    entityId: message.id,
    diff: { workOrderId: params.id },
  })

  return NextResponse.json({ ...message, authorName: session.user.name }, { status: 201 })
}
