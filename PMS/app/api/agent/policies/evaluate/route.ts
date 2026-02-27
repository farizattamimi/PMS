import { NextResponse } from 'next/server'
import { evaluateAction, mergePolicy, DEFAULT_POLICY } from '@/lib/policy-engine'
import { prisma } from '@/lib/prisma'
import { sessionProvider } from '@/lib/session-provider'
import { canAccessScopedPropertyId, scopedPropertyIdsForManagerViews } from '@/lib/access'

// POST /api/agent/policies/evaluate — dry-run an action against active policy
export async function POST(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const scopedPropertyIds = await scopedPropertyIdsForManagerViews(session)

  const body = await req.json().catch(() => ({}))
  const { actionType, context, propertyId } = body

  if (!actionType) {
    return NextResponse.json({ error: 'actionType is required' }, { status: 400 })
  }

  // Load policy for property if provided
  let policy = DEFAULT_POLICY
  if (propertyId) {
    if (!canAccessScopedPropertyId(scopedPropertyIds, propertyId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const policies = await prisma.agentPolicy.findMany({
      where: {
        isActive: true,
        OR: [
          { scopeType: 'property', scopeId: propertyId },
          { scopeType: 'global' },
        ],
      },
      orderBy: { version: 'desc' },
      take: 2,
    })
    const propertyPolicy = policies.find(p => p.scopeType === 'property')
    const globalPolicy = policies.find(p => p.scopeType === 'global')
    const base = globalPolicy ? mergePolicy(globalPolicy.configJson) : DEFAULT_POLICY
    policy = propertyPolicy ? mergePolicy({ ...base, ...(propertyPolicy.configJson as object) }) : base
  }

  const result = evaluateAction({ actionType, context: context ?? {} }, policy)

  return NextResponse.json({
    actionType,
    ...result,
    policySource: propertyId ? `property:${propertyId}` : 'default',
  })
}
