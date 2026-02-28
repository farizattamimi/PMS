import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { sessionProvider } from '@/lib/session-provider'
import { isAdmin, isManager, isTenant, tenantIdForUser } from '@/lib/access'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { signature } = await req.json()
  if (!signature || typeof signature !== 'string' || !signature.startsWith('data:image/')) {
    return NextResponse.json({ error: 'Invalid signature data' }, { status: 400 })
  }

  const lease = await prisma.lease.findUnique({
    where: { id: params.id },
    include: { tenant: { select: { userId: true } }, property: { select: { managerId: true } } },
  })
  if (!lease) return NextResponse.json({ error: 'Lease not found' }, { status: 404 })

  // Tenant signs tenantSignature
  if (isTenant(session)) {
    const tenantId = await tenantIdForUser(session.user.id)
    if (lease.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await prisma.lease.update({
      where: { id: params.id },
      data: { tenantSignature: signature },
    })
    await writeAudit({
      actorUserId: session.user.id,
      action: 'UPDATE',
      entityType: 'Lease',
      entityId: params.id,
      diff: { field: 'tenantSignature', action: 'signed' },
    })
    return NextResponse.json({ success: true, field: 'tenantSignature' })
  }

  // Manager / Admin signs managerSignature
  if (isManager(session) || isAdmin(session)) {
    if (isManager(session) && lease.property?.managerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await prisma.lease.update({
      where: { id: params.id },
      data: { managerSignature: signature },
    })
    await writeAudit({
      actorUserId: session.user.id,
      action: 'UPDATE',
      entityType: 'Lease',
      entityId: params.id,
      diff: { field: 'managerSignature', action: 'signed' },
    })
    return NextResponse.json({ success: true, field: 'managerSignature' })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
