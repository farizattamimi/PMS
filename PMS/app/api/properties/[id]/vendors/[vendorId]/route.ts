import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { assertManagerOwnsProperty } from '@/lib/access'

export async function DELETE(req: Request, { params }: { params: { id: string; vendorId: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!(await assertManagerOwnsProperty(session, params.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.propertyVendor.deleteMany({
    where: { propertyId: params.id, vendorId: params.vendorId },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'DELETE',
    entityType: 'PropertyVendor',
    entityId: `${params.id}:${params.vendorId}`,
    diff: { propertyId: params.id, vendorId: params.vendorId },
  })

  return NextResponse.json({ success: true })
}
