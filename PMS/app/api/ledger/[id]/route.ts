import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { assertManagerOwnsProperty } from '@/lib/access'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const entry = await prisma.ledgerEntry.findUnique({
    where: { id: params.id },
    include: { lease: { select: { unit: { select: { propertyId: true } } } } },
  })
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const propertyId = entry.propertyId ?? entry.lease?.unit?.propertyId
  if (propertyId && !(await assertManagerOwnsProperty(session, propertyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  // Only memo and type can be updated after creation
  const { memo, type } = body

  const updateData: any = {}
  if (memo !== undefined) updateData.memo = memo
  if (type !== undefined) updateData.type = type

  const updated = await prisma.ledgerEntry.update({
    where: { id: params.id },
    data: updateData,
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'UPDATE',
    entityType: 'LedgerEntry',
    entityId: params.id,
    diff: updateData,
  })

  return NextResponse.json(updated)
}
