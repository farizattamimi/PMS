import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { messageThreadScopeWhere } from '@/lib/access'
import { sessionProvider } from '@/lib/session-provider'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scopeWhere = await messageThreadScopeWhere(session)
  if (!scopeWhere) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const thread = await prisma.messageThread.findFirst({
    where: {
      id: params.id,
      ...scopeWhere,
    },
    include: {
      property: { select: { id: true, name: true, managerId: true } },
      tenant: { include: { user: { select: { id: true, name: true, email: true } } } },
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Mark messages from the other party as read
  await prisma.message.updateMany({
    where: {
      threadId: params.id,
      authorId: { not: session.user.id },
      readAt: null,
    },
    data: { readAt: new Date() },
  })

  return NextResponse.json(thread)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const scopeWhere = await messageThreadScopeWhere(session)
  if (!scopeWhere) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const thread = await prisma.messageThread.findFirst({
    where: {
      id: params.id,
      ...scopeWhere,
    },
    select: { id: true },
  })
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updated = await prisma.messageThread.update({
    where: { id: params.id },
    data: { status: body.status },
  })

  return NextResponse.json(updated)
}
