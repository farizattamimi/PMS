import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
    take: 50,
  })

  return NextResponse.json(notifications)
}

export async function PATCH() {
  // Mark all as read
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.notification.updateMany({
    where: { userId: session.user.id, read: false },
    data: { read: true },
  })

  return NextResponse.json({ success: true })
}
