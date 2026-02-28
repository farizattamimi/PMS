import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole !== 'OWNER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { orgId: true },
  })
  if (!user?.orgId) return NextResponse.json([])

  const distributions = await prisma.distribution.findMany({
    where: { ownerOrgId: user.orgId },
    include: { property: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(distributions)
}
