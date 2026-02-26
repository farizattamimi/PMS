import { prisma } from './prisma'
import { AuditAction, Prisma } from '@prisma/client'

interface WriteAuditParams {
  actorUserId?: string
  action: AuditAction
  entityType: string
  entityId: string
  diff?: Record<string, unknown>
}

export async function writeAudit({ actorUserId, action, entityType, entityId, diff }: WriteAuditParams) {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: actorUserId ?? null,
        action,
        entityType,
        entityId,
        diff: diff ? (diff as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    })
  } catch (err) {
    // Audit failures must never crash the main operation
    console.error('[audit] failed to write audit log', err)
  }
}
