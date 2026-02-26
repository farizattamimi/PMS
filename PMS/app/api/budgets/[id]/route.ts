import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const budget = await prisma.budget.findUnique({ where: { id: params.id } })
  if (!budget) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updateData: any = {}
  if (body.budgetedAmount !== undefined) updateData.budgetedAmount = parseFloat(body.budgetedAmount)
  if (body.notes !== undefined) updateData.notes = body.notes

  const updated = await prisma.budget.update({ where: { id: params.id }, data: updateData })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'UPDATE',
    entityType: 'Budget',
    entityId: params.id,
    diff: updateData,
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const budget = await prisma.budget.findUnique({ where: { id: params.id } })
  if (!budget) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.budget.delete({ where: { id: params.id } })

  return NextResponse.json({ ok: true })
}
