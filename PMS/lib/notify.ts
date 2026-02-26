import { prisma } from './prisma'

interface CreateNotificationOptions {
  userId: string
  title: string
  body?: string
  type: string
  entityType?: string
  entityId?: string
}

export async function createNotification(opts: CreateNotificationOptions) {
  return prisma.notification.create({
    data: {
      userId: opts.userId,
      title: opts.title,
      body: opts.body,
      type: opts.type,
      entityType: opts.entityType,
      entityId: opts.entityId,
    },
  })
}
