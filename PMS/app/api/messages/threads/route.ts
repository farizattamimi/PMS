import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import {
  isManager,
  isTenant,
  messageThreadScopeWhere,
  propertyScopeWhere,
  tenantIdForUser,
} from '@/lib/access'
import { publishAgentEvent } from '@/lib/agent-events'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')

  const scopeWhere = await messageThreadScopeWhere(session)
  if (!scopeWhere) return NextResponse.json([])

  const where: any = { ...scopeWhere }
  if (propertyId) where.propertyId = propertyId

  const threads = await prisma.messageThread.findMany({
    where,
    include: {
      property: { select: { id: true, name: true } },
      tenant: { include: { user: { select: { id: true, name: true, email: true } } } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  // Attach unread count per thread for current user
  const threadsWithUnread = await Promise.all(threads.map(async t => {
    const unread = await prisma.message.count({
      where: {
        threadId: t.id,
        authorId: { not: session.user.id },
        readAt: null,
      },
    })
    return { ...t, unreadCount: unread }
  }))

  return NextResponse.json(threadsWithUnread)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const rawPropertyId = typeof body.propertyId === 'string' ? body.propertyId : ''
  const rawTenantId = typeof body.tenantId === 'string' ? body.tenantId : ''
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''

  if (!subject || !message) {
    return NextResponse.json({ error: 'subject and message required' }, { status: 400 })
  }

  let propertyId = rawPropertyId
  let tenantId = rawTenantId

  if (isTenant(session)) {
    const tenantIdFromSession = await tenantIdForUser(session.user.id)
    if (!tenantIdFromSession) return NextResponse.json({ error: 'Tenant profile not found' }, { status: 403 })
    tenantId = tenantIdFromSession

    const activeLease = await prisma.lease.findFirst({
      where: {
        tenantId,
        status: 'ACTIVE',
        ...(propertyId ? { propertyId } : {}),
      },
      orderBy: { endDate: 'desc' },
      select: { propertyId: true },
    })
    if (!activeLease?.propertyId) {
      return NextResponse.json({ error: 'No active lease found for this property' }, { status: 403 })
    }
    propertyId = activeLease.propertyId
  } else {
    if (!propertyId || !tenantId) {
      return NextResponse.json({ error: 'propertyId and tenantId required' }, { status: 400 })
    }
    if (isManager(session)) {
      const property = await prisma.property.findFirst({
        where: {
          id: propertyId,
          ...propertyScopeWhere(session),
        },
        select: { id: true },
      })
      if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const tenant = await prisma.tenant.findFirst({
      where: {
        id: tenantId,
        OR: [
          { propertyId },
          { leases: { some: { propertyId, status: 'ACTIVE' } } },
        ],
      },
      select: { id: true },
    })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant is not linked to this property' }, { status: 400 })
    }
  }

  const thread = await prisma.messageThread.create({
    data: {
      propertyId,
      tenantId,
      subject,
      messages: {
        create: {
          authorId: session.user.id,
          body: message,
        },
      },
    },
    include: {
      messages: true,
      property: { select: { id: true, name: true, managerId: true } },
      tenant: { include: { user: { select: { id: true, name: true } } } },
    },
  })

  // Notify the other party
  const authorIsManagerSide = session.user.systemRole !== 'TENANT'
  if (authorIsManagerSide) {
    // Notify tenant
    await prisma.notification.create({
      data: {
        userId: thread.tenant.user.id,
        title: `New message from your property manager`,
        body: `Re: ${subject}`,
        type: 'GENERAL',
        entityType: 'MessageThread',
        entityId: thread.id,
      },
    })
  } else {
    // Notify property manager
    await prisma.notification.create({
      data: {
        userId: thread.property.managerId,
        title: `New message from ${thread.tenant.user.name}`,
        body: `Re: ${subject}`,
        type: 'GENERAL',
        entityType: 'MessageThread',
        entityId: thread.id,
      },
    })
  }

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'MessageThread',
    entityId: thread.id,
    diff: { propertyId, tenantId, subject },
  })

  // Notify autonomous agent of new inbound message thread (fire-and-forget)
  if (session.user.systemRole === 'TENANT') {
    publishAgentEvent({
      eventType: 'NEW_MESSAGE_THREAD',
      propertyId,
      entityId: thread.id,
      entityType: 'message_thread',
    })
  }

  return NextResponse.json(thread, { status: 201 })
}
