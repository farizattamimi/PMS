import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { messageThreadScopeWhere } from '@/lib/access'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scopeWhere = await messageThreadScopeWhere(session)
  if (!scopeWhere) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const thread = await prisma.messageThread.findFirst({
    where: {
      id: params.id,
      ...scopeWhere,
    },
    include: {
      property: { select: { managerId: true, name: true } },
      tenant: { include: { user: { select: { id: true, name: true } } } },
    },
  })
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  if (!body.message?.trim()) {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }

  const message = await prisma.message.create({
    data: {
      threadId: params.id,
      authorId: session.user.id,
      body: body.message.trim(),
    },
  })

  // Update thread updatedAt
  await prisma.messageThread.update({
    where: { id: params.id },
    data: { updatedAt: new Date() },
  })

  // Notify the other party
  const isManager = session.user.systemRole !== 'TENANT'
  if (isManager) {
    await prisma.notification.create({
      data: {
        userId: thread.tenant.user.id,
        title: `New message from your property manager`,
        body: body.message.trim().slice(0, 100),
        type: 'GENERAL',
        entityType: 'MessageThread',
        entityId: params.id,
      },
    })
  } else {
    await prisma.notification.create({
      data: {
        userId: thread.property.managerId,
        title: `New message from ${thread.tenant.user.name}`,
        body: body.message.trim().slice(0, 100),
        type: 'GENERAL',
        entityType: 'MessageThread',
        entityId: params.id,
      },
    })
  }

  return NextResponse.json(message, { status: 201 })
}
