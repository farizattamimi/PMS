import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { assertManagerOwnsProperty } from '@/lib/access'

export async function GET(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')
  const period = searchParams.get('period') // YYYY-MM

  if (!propertyId || !period) {
    return NextResponse.json({ error: 'propertyId and period are required' }, { status: 400 })
  }

  if (!(await assertManagerOwnsProperty(session, propertyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const budgets = await prisma.budget.findMany({
    where: { propertyId, period },
    orderBy: { category: 'asc' },
  })

  return NextResponse.json(budgets)
}

export async function POST(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { propertyId, period, category, budgetedAmount, notes } = body

  if (!propertyId || !period || !category || budgetedAmount == null) {
    return NextResponse.json({ error: 'propertyId, period, category, and budgetedAmount are required' }, { status: 400 })
  }

  if (!(await assertManagerOwnsProperty(session, propertyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const budget = await prisma.budget.upsert({
    where: { propertyId_period_category: { propertyId, period, category } },
    update: { budgetedAmount: parseFloat(budgetedAmount), notes: notes || null },
    create: {
      propertyId,
      period,
      category,
      budgetedAmount: parseFloat(budgetedAmount),
      notes: notes || null,
    },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'Budget',
    entityId: budget.id,
    diff: { propertyId, period, category, budgetedAmount },
  })

  return NextResponse.json(budget, { status: 201 })
}
