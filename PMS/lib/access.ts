import { Prisma } from '@prisma/client'
import { Session } from 'next-auth'
import { prisma } from './prisma'

export function isAdmin(session: Session): boolean {
  return session.user.systemRole === 'ADMIN'
}

export function isManager(session: Session): boolean {
  return session.user.systemRole === 'MANAGER'
}

export function isTenant(session: Session): boolean {
  return session.user.systemRole === 'TENANT'
}

export function propertyScopeWhere(session: Session): Prisma.PropertyWhereInput {
  if (isAdmin(session)) return {}
  if (isManager(session)) return { managerId: session.user.id }
  return { id: '__forbidden__' }
}

export function workOrderScopeWhere(session: Session): Prisma.WorkOrderWhereInput {
  if (isAdmin(session)) return {}
  if (isManager(session)) return { property: { managerId: session.user.id } }
  return { submittedById: session.user.id }
}

export function documentScopeWhere(session: Session): Prisma.DocumentWhereInput | null {
  if (isAdmin(session)) return {}
  if (isManager(session)) {
    return {
      OR: [
        { property: { managerId: session.user.id } },
        { workOrder: { property: { managerId: session.user.id } } },
        { uploadedById: session.user.id },
      ],
    }
  }
  return null
}

export async function tenantIdForUser(userId: string): Promise<string | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { userId },
    select: { id: true },
  })
  return tenant?.id ?? null
}

export async function messageThreadScopeWhere(
  session: Session
): Promise<Prisma.MessageThreadWhereInput | null> {
  if (isAdmin(session)) return {}
  if (isManager(session)) return { property: { managerId: session.user.id } }
  const tenantId = await tenantIdForUser(session.user.id)
  if (!tenantId) return null
  return { tenantId }
}
