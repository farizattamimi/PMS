import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { assertManagerOwnsProperty } from '@/lib/access'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!(await assertManagerOwnsProperty(session, params.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { vendorId } = await req.json()
  if (!vendorId) return NextResponse.json({ error: 'vendorId required' }, { status: 400 })

  const link = await prisma.propertyVendor.upsert({
    where: { propertyId_vendorId: { propertyId: params.id, vendorId } },
    update: {},
    create: { propertyId: params.id, vendorId },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'PropertyVendor',
    entityId: `${params.id}:${vendorId}`,
    diff: { propertyId: params.id, vendorId },
  })

  return NextResponse.json(link, { status: 201 })
}
