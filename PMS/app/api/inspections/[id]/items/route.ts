import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { assertManagerOwnsProperty } from '@/lib/access'

const VALID_CONDITIONS = ['GOOD', 'FAIR', 'POOR', 'FAILED']

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const inspection = await prisma.inspection.findUnique({ where: { id: params.id } })
  if (!inspection) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!(await assertManagerOwnsProperty(session, inspection.propertyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  if (!body.area) return NextResponse.json({ error: 'area required' }, { status: 400 })

  const condition = body.condition ?? 'GOOD'
  if (!VALID_CONDITIONS.includes(condition)) {
    return NextResponse.json({ error: `condition must be one of: ${VALID_CONDITIONS.join(', ')}` }, { status: 400 })
  }

  const item = await prisma.inspectionItem.create({
    data: {
      inspectionId: params.id,
      area: body.area,
      condition,
      assetId: body.assetId || null,
      notes: body.notes || null,
    },
    include: { asset: { select: { id: true, name: true, category: true } } },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'InspectionItem',
    entityId: item.id,
    diff: { inspectionId: params.id, area: body.area, condition },
  })

  return NextResponse.json(item, { status: 201 })
}
