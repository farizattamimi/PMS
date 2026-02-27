import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sessionProvider } from '@/lib/session-provider'
import { scopedPropertyIdsForManagerViews } from '@/lib/access'

// GET /api/agent/policies
export async function GET(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const scopedPropertyIds = await scopedPropertyIdsForManagerViews(session)

  const { searchParams } = new URL(req.url)
  const scopeType = searchParams.get('scopeType')
  const scopeId = searchParams.get('scopeId')

  const where: Record<string, unknown> = { isActive: true }
  if (scopeType) where.scopeType = scopeType
  if (scopeId) where.scopeId = scopeId

  if (scopedPropertyIds !== null) {
    where.OR = [
      { scopeType: 'global' },
      { scopeType: 'property', scopeId: { in: scopedPropertyIds } },
    ]
    if (scopeType === 'property' && scopeId && !scopedPropertyIds.includes(scopeId)) {
      return NextResponse.json([])
    }
  }

  const policies = await prisma.agentPolicy.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(policies)
}

// POST /api/agent/policies — create (versions existing policy if one exists for same scope)
export async function POST(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { scopeType, scopeId, configJson } = body

  if (!scopeType || !configJson) {
    return NextResponse.json({ error: 'scopeType and configJson are required' }, { status: 400 })
  }

  // Deactivate existing policies for the same scope
  await prisma.agentPolicy.updateMany({
    where: { scopeType, scopeId: scopeId ?? null, isActive: true },
    data: { isActive: false },
  })

  // Count existing to set version
  const existingCount = await prisma.agentPolicy.count({
    where: { scopeType, scopeId: scopeId ?? null },
  })

  const policy = await prisma.agentPolicy.create({
    data: {
      scopeType,
      scopeId,
      configJson,
      version: existingCount + 1,
      createdById: session.user.id,
    },
  })

  return NextResponse.json(policy, { status: 201 })
}
