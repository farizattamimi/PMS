import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { assertManagerOwnsProperty } from '@/lib/access'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const application = await prisma.tenantApplication.findUnique({ where: { id: params.id } })
  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!(await assertManagerOwnsProperty(session, application.propertyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (application.status === 'APPROVED' || application.status === 'DENIED') {
    return NextResponse.json(
      { error: `Cannot deny application with status ${application.status}` },
      { status: 400 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const { reviewNotes } = body

  const updated = await prisma.tenantApplication.update({
    where: { id: params.id },
    data: {
      status: 'DENIED',
      reviewNotes: reviewNotes || application.reviewNotes,
      reviewedBy: session.user.id,
      reviewedAt: new Date(),
    },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'STATUS_CHANGE',
    entityType: 'TenantApplication',
    entityId: params.id,
    diff: { status: 'DENIED', reviewNotes },
  })

  return NextResponse.json(updated)
}
