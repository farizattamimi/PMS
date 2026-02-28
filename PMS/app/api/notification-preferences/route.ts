import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { DeliveryChannel } from '@prisma/client'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [preferences, user] = await Promise.all([
    prisma.notificationPreference.findMany({
      where: { userId: session.user.id },
      orderBy: [{ notificationType: 'asc' }, { channel: 'asc' }],
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { phone: true },
    }),
  ])

  return NextResponse.json({ preferences, phone: user?.phone ?? '' })
}

const VALID_CHANNELS: DeliveryChannel[] = ['IN_APP', 'EMAIL', 'SMS']

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { preferences, phone } = body as {
    preferences?: { notificationType: string; channel: DeliveryChannel; enabled: boolean }[]
    phone?: string
  }

  // Update phone on User if provided
  if (phone !== undefined) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { phone: phone || null },
    })
  }

  // Upsert each preference row
  if (preferences && Array.isArray(preferences)) {
    for (const pref of preferences) {
      if (!VALID_CHANNELS.includes(pref.channel)) continue
      await prisma.notificationPreference.upsert({
        where: {
          userId_notificationType_channel: {
            userId: session.user.id,
            notificationType: pref.notificationType,
            channel: pref.channel,
          },
        },
        update: { enabled: pref.enabled },
        create: {
          userId: session.user.id,
          notificationType: pref.notificationType,
          channel: pref.channel,
          enabled: pref.enabled,
        },
      })
    }
  }

  await writeAudit({
    actorUserId: session.user.id,
    action: 'UPDATE',
    entityType: 'NotificationPreference',
    entityId: session.user.id,
    diff: { preferences, phone },
  })

  // Return updated state
  const updated = await prisma.notificationPreference.findMany({
    where: { userId: session.user.id },
    orderBy: [{ notificationType: 'asc' }, { channel: 'asc' }],
  })
  const updatedUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { phone: true },
  })

  return NextResponse.json({ preferences: updated, phone: updatedUser?.phone ?? '' })
}
