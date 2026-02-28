import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { deliverNotification } from '@/lib/deliver'
import { distributionNoticeEmail, distributionNoticeSms } from '@/lib/email'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { status } = body

  if (!status || !['APPROVED', 'PAID'].includes(status)) {
    return NextResponse.json({ error: 'status must be APPROVED or PAID' }, { status: 400 })
  }

  const distribution = await prisma.distribution.findUnique({
    where: { id: params.id },
    include: {
      property: { select: { name: true, managerId: true } },
      ownerOrg: { select: { name: true, users: { select: { id: true, name: true } } } },
    },
  })

  if (!distribution) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Manager scope check
  if (session.user.systemRole === 'MANAGER' && distribution.property.managerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data: any = { status }
  if (status === 'PAID') data.paidAt = new Date()

  const updated = await prisma.distribution.update({
    where: { id: params.id },
    data,
  })

  // Notify owner users when approved or paid
  for (const ownerUser of distribution.ownerOrg.users) {
    await deliverNotification({
      userId: ownerUser.id,
      title: `Distribution ${status.toLowerCase()}: ${distribution.property.name} (${distribution.period})`,
      body: `Net distribution: $${distribution.netDistribution.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      type: 'GENERAL',
      entityType: 'Distribution',
      entityId: distribution.id,
      emailSubject: `Distribution Statement — ${distribution.property.name}`,
      emailHtml: distributionNoticeEmail(
        ownerUser.name,
        distribution.property.name,
        distribution.period,
        distribution.grossIncome,
        distribution.expenses,
        distribution.managementFee,
        distribution.netDistribution,
      ),
      smsBody: distributionNoticeSms(
        ownerUser.name,
        distribution.property.name,
        distribution.period,
        distribution.netDistribution,
      ),
    })
  }

  await writeAudit({
    actorUserId: session.user.id,
    action: 'STATUS_CHANGE',
    entityType: 'Distribution',
    entityId: params.id,
    diff: { status },
  })

  return NextResponse.json(updated)
}
