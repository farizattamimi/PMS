import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { evaluateAction, mergePolicy, DEFAULT_POLICY } from '@/lib/policy-engine'
import { prisma } from '@/lib/prisma'

// POST /api/agent/policies/evaluate — dry-run an action against active policy
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { actionType, context, propertyId } = body

  if (!actionType) {
    return NextResponse.json({ error: 'actionType is required' }, { status: 400 })
  }

  // Load policy for property if provided
  let policy = DEFAULT_POLICY
  if (propertyId) {
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
