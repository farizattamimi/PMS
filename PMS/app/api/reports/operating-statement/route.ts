import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { orgScopeWhere } from '@/lib/access'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT' || session.user.systemRole === 'VENDOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId') // omit for portfolio
  const startMonth = searchParams.get('startMonth') // YYYY-MM
  const endMonth = searchParams.get('endMonth') // YYYY-MM

  if (!startMonth || !endMonth) {
    return NextResponse.json({ error: 'startMonth and endMonth are required' }, { status: 400 })
  }

  const start = new Date(`${startMonth}-01`)
  const endParsed = new Date(`${endMonth}-01`)
  endParsed.setMonth(endParsed.getMonth() + 1)

  // Scope: single property or portfolio
  const orgScope = orgScopeWhere(session)
  const propFilter =
    session.user.systemRole === 'MANAGER'
      ? propertyId
        ? { id: propertyId, managerId: session.user.id }
        : { managerId: session.user.id }
      : propertyId
        ? { id: propertyId, ...orgScope }
        : { ...orgScope }

  const properties = await prisma.property.findMany({
    where: propFilter,
    select: { id: true, name: true },
  })

  if (properties.length === 0) {
    return NextResponse.json({ error: 'No properties found' }, { status: 404 })
  }

  const propIds = properties.map((p) => p.id)
  const isPortfolio = !propertyId

  // ── Queries ──
  const [ledgerEntries, budgets, workOrderCosts] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { propertyId: { in: propIds }, effectiveDate: { gte: start, lt: endParsed } },
      select: {
        id: true,
        propertyId: true,
        type: true,
        amount: true,
        effectiveDate: true,
        memo: true,
      },
      orderBy: { effectiveDate: 'asc' },
    }),
    prisma.budget.findMany({
      where: {
        propertyId: { in: propIds },
        period: { gte: startMonth, lte: endMonth },
      },
    }),
    prisma.workOrderCost.findMany({
      where: {
        workOrder: {
          propertyId: { in: propIds },
          createdAt: { gte: start, lt: endParsed },
        },
      },
      select: { costType: true, amount: true },
    }),
  ])

  // ── Revenue & Expense aggregation by type ──
  const REVENUE_TYPES = ['RENT', 'DEPOSIT', 'LATE_FEE', 'OTHER_INCOME']
  const EXPENSE_TYPES = ['MAINTENANCE_EXPENSE', 'UTILITY', 'OTHER_EXPENSE']

  // Build budget lookup: type → total budgeted
  const budgetByType = new Map<string, number>()
  for (const b of budgets) {
    budgetByType.set(b.category, (budgetByType.get(b.category) ?? 0) + b.budgetedAmount)
  }
  const hasBudgets = budgets.length > 0

  function buildLineItems(types: string[], entries: typeof ledgerEntries, isExpense: boolean) {
    const items: Record<string, { actual: number; budget: number | null; variance: number | null }> = {}
    let total = 0
    for (const t of types) {
      const actual = entries
        .filter((e) => e.type === t)
        .reduce((s, e) => s + (isExpense ? Math.abs(e.amount) : e.amount), 0)
      const budget = budgetByType.has(t) ? budgetByType.get(t)! : null
      const variance = budget !== null ? actual - budget : null
      items[t] = { actual, budget, variance }
      total += actual
    }
    return { items, total }
  }

  const revenue = buildLineItems(REVENUE_TYPES, ledgerEntries.filter((e) => e.amount > 0), false)
  const expenses = buildLineItems(EXPENSE_TYPES, ledgerEntries.filter((e) => e.amount < 0), true)

  const noi = revenue.total - expenses.total

  // Budget NOI
  const revenueBudgetTotal = REVENUE_TYPES.reduce((s, t) => s + (budgetByType.get(t) ?? 0), 0)
  const expenseBudgetTotal = EXPENSE_TYPES.reduce((s, t) => s + (budgetByType.get(t) ?? 0), 0)
  const noiBudget = hasBudgets ? revenueBudgetTotal - expenseBudgetTotal : null
  const noiVariance = noiBudget !== null ? noi - noiBudget : null

  // ── Maintenance cost breakdown by costType ──
  const costByType = new Map<string, number>()
  for (const c of workOrderCosts) {
    costByType.set(c.costType, (costByType.get(c.costType) ?? 0) + c.amount)
  }
  const maintenanceBreakdown = Array.from(costByType.entries()).map(([category, amount]) => ({
    category,
    amount: Math.round(amount * 100) / 100,
  }))

  // ── Monthly trend (last 6 months from endMonth) ──
  const trendStart = new Date(`${endMonth}-01`)
  trendStart.setMonth(trendStart.getMonth() - 5)

  const trendEntries = await prisma.ledgerEntry.findMany({
    where: {
      propertyId: { in: propIds },
      effectiveDate: { gte: trendStart, lt: endParsed },
    },
    select: { type: true, amount: true, effectiveDate: true },
  })

  const trendMap = new Map<string, { revenue: number; expenses: number }>()
  for (const e of trendEntries) {
    const m = e.effectiveDate.toISOString().slice(0, 7)
    const bucket = trendMap.get(m) ?? { revenue: 0, expenses: 0 }
    if (e.amount > 0) bucket.revenue += e.amount
    else bucket.expenses += Math.abs(e.amount)
    trendMap.set(m, bucket)
  }

  const monthlyTrend: { month: string; revenue: number; expenses: number; noi: number }[] = []
  const cursor = new Date(trendStart)
  for (let i = 0; i < 6; i++) {
    const m = cursor.toISOString().slice(0, 7)
    const bucket = trendMap.get(m) ?? { revenue: 0, expenses: 0 }
    monthlyTrend.push({
      month: m,
      revenue: Math.round(bucket.revenue * 100) / 100,
      expenses: Math.round(bucket.expenses * 100) / 100,
      noi: Math.round((bucket.revenue - bucket.expenses) * 100) / 100,
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return NextResponse.json({
    propertyId: propertyId ?? null,
    propertyName: isPortfolio ? 'Portfolio' : properties[0]?.name,
    isPortfolio,
    startMonth,
    endMonth,
    revenue: { ...revenue.items, total: Math.round(revenue.total * 100) / 100 },
    expenses: { ...expenses.items, total: Math.round(expenses.total * 100) / 100 },
    noi: Math.round(noi * 100) / 100,
    noiBudget: noiBudget !== null ? Math.round(noiBudget * 100) / 100 : null,
    noiVariance: noiVariance !== null ? Math.round(noiVariance * 100) / 100 : null,
    hasBudgets,
    maintenanceBreakdown,
    monthlyTrend,
    ledgerEntries: ledgerEntries.map((e) => ({
      id: e.id,
      type: e.type,
      amount: e.amount,
      effectiveDate: e.effectiveDate,
      memo: e.memo,
    })),
  })
}
