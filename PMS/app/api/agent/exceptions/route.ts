import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { scopedPropertyIdFilter, scopedPropertyIdsForManagerViews } from '@/lib/access'
import { sessionProvider } from '@/lib/session-provider'

// GET /api/agent/exceptions
export async function GET(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const scopedPropertyIds = await scopedPropertyIdsForManagerViews(session)

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const propertyId = searchParams.get('propertyId')
  const severity = searchParams.get('severity')

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  const propertyFilter = scopedPropertyIdFilter(scopedPropertyIds, propertyId)
  if (propertyFilter !== undefined) where.propertyId = propertyFilter
  if (severity) where.severity = severity

  const exceptions = await prisma.agentException.findMany({
    where,
    orderBy: [
      // CRITICAL first, then by requiresBy, then createdAt
      { requiresBy: 'asc' },
      { createdAt: 'desc' },
    ],
    take: 100,
  })

  return NextResponse.json(exceptions)
}
