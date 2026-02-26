import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/agent/exceptions
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const propertyId = searchParams.get('propertyId')
  const severity = searchParams.get('severity')

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (propertyId) where.propertyId = propertyId
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
