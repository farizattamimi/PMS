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

export async function scopedPropertyIdsForManagerViews(session: Session): Promise<string[] | null> {
  if (isAdmin(session)) return null
  if (!isManager(session)) return []
  const properties = await prisma.property.findMany({
    where: { managerId: session.user.id },
    select: { id: true },
  })
  return properties.map((p) => p.id)
}

export function scopedPropertyIdFilter(
  scopedPropertyIds: string[] | null,
  requestedPropertyId?: string | null
): string | Prisma.StringNullableFilter | undefined {
  if (scopedPropertyIds === null) {
    return requestedPropertyId ?? undefined
  }
  if (requestedPropertyId) {
    return scopedPropertyIds.includes(requestedPropertyId) ? requestedPropertyId : { in: [] }
  }
  return { in: scopedPropertyIds }
}

export function canAccessScopedPropertyId(
  scopedPropertyIds: string[] | null,
  propertyId?: string | null
): boolean {
  if (scopedPropertyIds === null) return true
  if (!propertyId) return false
  return scopedPropertyIds.includes(propertyId)
}
