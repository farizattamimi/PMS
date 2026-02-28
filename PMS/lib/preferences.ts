import { prisma } from './prisma'
import { DeliveryChannel } from '@prisma/client'

export interface ChannelPreferences {
  IN_APP: boolean
  EMAIL: boolean
  SMS: boolean
}

const DEFAULTS: ChannelPreferences = {
  IN_APP: true,
  EMAIL: true,
  SMS: false,
}

/**
 * Resolve the effective notification preferences for a user + type.
 *
 * Resolution order:
 *   1. Hard-coded defaults (IN_APP=on, EMAIL=on, SMS=off)
 *   2. User's wildcard "*" overrides
 *   3. User's specific notificationType overrides
 */
export async function resolvePreferences(
  userId: string,
  notificationType: string,
): Promise<ChannelPreferences> {
  const rows = await prisma.notificationPreference.findMany({
    where: {
      userId,
      notificationType: { in: ['*', notificationType] },
    },
  })

  const result: ChannelPreferences = { ...DEFAULTS }

  // Apply wildcard overrides first
  for (const row of rows) {
    if (row.notificationType === '*') {
      result[row.channel as keyof ChannelPreferences] = row.enabled
    }
  }

  // Apply specific type overrides (take precedence)
  for (const row of rows) {
    if (row.notificationType === notificationType) {
      result[row.channel as keyof ChannelPreferences] = row.enabled
    }
  }

  return result
}
