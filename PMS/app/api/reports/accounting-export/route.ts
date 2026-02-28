import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { generateIIF, type IIFRow } from '@/lib/iif'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT' || session.user.systemRole === 'VENDOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format') // csv | iif | json
  const startDate = searchParams.get('startDate') // YYYY-MM-DD
  const endDate = searchParams.get('endDate') // YYYY-MM-DD
  const propertyId = searchParams.get('propertyId') || null
  const typesParam = searchParams.get('types') || null
  const includeWOCosts = searchParams.get('includeWOCosts') === 'true'

  if (!format || !startDate || !endDate) {
    return NextResponse.json({ error: 'format, startDate, and endDate are required' }, { status: 400 })
  }
  if (!['csv', 'iif', 'json'].includes(format)) {
    return NextResponse.json({ error: 'format must be csv, iif, or json' }, { status: 400 })
  }

  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T23:59:59.999Z`)

  // Scope: MANAGER sees only managed properties, ADMIN sees all
  const propFilter =
    session.user.systemRole === 'MANAGER'
      ? propertyId
        ? { id: propertyId, managerId: session.user.id }
        : { managerId: session.user.id }
      : propertyId
        ? { id: propertyId }
        : {}

  const properties = await prisma.property.findMany({
    where: propFilter,
    select: { id: true, name: true },
  })

  if (properties.length === 0) {
    return NextResponse.json({ error: 'No properties found' }, { status: 404 })
  }

  const propIds = properties.map((p) => p.id)
  const propNameMap = new Map(properties.map((p) => [p.id, p.name]))

  // Parse type filter
  const typeFilter = typesParam ? typesParam.split(',').map((t) => t.trim()) : undefined

  // Query ledger entries
  const ledgerEntries = await prisma.ledgerEntry.findMany({
    where: {
      propertyId: { in: propIds },
      effectiveDate: { gte: start, lte: end },
      ...(typeFilter ? { type: { in: typeFilter as any } } : {}),
    },
    include: {
      lease: {
        include: {
          unit: { select: { unitNumber: true } },
          tenant: { include: { user: { select: { name: true } } } },
        },
      },
      property: { select: { name: true } },
    },
    orderBy: { effectiveDate: 'asc' },
  })

  // Optionally query WO costs
  let woCosts: any[] = []
  if (includeWOCosts) {
    woCosts = await prisma.workOrderCost.findMany({
      where: {
        workOrder: {
          propertyId: { in: propIds },
          completedAt: { gte: start, lte: end },
        },
      },
      include: {
        workOrder: {
          include: {
            property: { select: { name: true } },
            unit: { select: { unitNumber: true } },
            assignedVendor: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  // Audit
  writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'accounting-export',
    entityId: `${format}-${startDate}-${endDate}`,
    diff: { format, startDate, endDate, propertyId, types: typesParam, includeWOCosts, entryCount: ledgerEntries.length, woCostCount: woCosts.length },
  })

  // ── JSON preview ──
  if (format === 'json') {
    const totalIncome = ledgerEntries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0)
    const totalExpense = ledgerEntries.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)
    const woCostTotal = woCosts.reduce((s, c) => s + c.amount, 0)
    return NextResponse.json({
      entryCount: ledgerEntries.length,
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      woCostCount: woCosts.length,
      woCostTotal: Math.round(woCostTotal * 100) / 100,
      propertyCount: properties.length,
    })
  }

  // ── CSV ──
  if (format === 'csv') {
    const csvRows: string[] = []

    // Ledger header
    csvRows.push(['Date', 'Type', 'Property', 'Unit', 'Tenant', 'Lease ID', 'Amount', 'Currency', 'Memo', 'Entry ID'].map(csvEscape).join(','))

    for (const e of ledgerEntries) {
      csvRows.push([
        e.effectiveDate.toISOString().slice(0, 10),
        e.type,
        e.property?.name ?? '',
        e.lease?.unit?.unitNumber ?? '',
        e.lease?.tenant?.user?.name ?? '',
        e.leaseId ?? '',
        String(e.amount),
        e.currency,
        e.memo ?? '',
        e.id,
      ].map(csvEscape).join(','))
    }

    if (includeWOCosts && woCosts.length > 0) {
      csvRows.push('') // separator
      csvRows.push(['Date', 'WO ID', 'WO Title', 'Property', 'Unit', 'Vendor', 'Cost Type', 'Amount', 'Invoice #', 'Paid', 'Memo', 'Cost ID'].map(csvEscape).join(','))

      for (const c of woCosts) {
        csvRows.push([
          c.createdAt.toISOString().slice(0, 10),
          c.workOrderId,
          c.workOrder?.title ?? '',
          c.workOrder?.property?.name ?? '',
          c.workOrder?.unit?.unitNumber ?? '',
          c.workOrder?.assignedVendor?.name ?? '',
          c.costType,
          String(c.amount),
          c.invoiceNumber ?? '',
          c.paid ? 'Yes' : 'No',
          c.memo ?? '',
          c.id,
        ].map(csvEscape).join(','))
      }
    }

    const csv = csvRows.join('\n')
    const scope = propertyId ? (propNameMap.get(propertyId) ?? 'property').replace(/\s+/g, '-') : 'portfolio'
    const filename = `ledger-${scope}-${startDate}-to-${endDate}.csv`

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  // ── IIF ──
  const iifRows: IIFRow[] = ledgerEntries.map((e) => ({
    id: e.id,
    date: e.effectiveDate.toISOString().slice(0, 10),
    type: e.type,
    amount: e.amount,
    memo: e.memo ?? '',
    propertyName: e.property?.name ?? '',
    tenantName: e.lease?.tenant?.user?.name,
    unitNumber: e.lease?.unit?.unitNumber,
  }))

  // Append WO costs as MAINTENANCE_EXPENSE entries
  if (includeWOCosts) {
    for (const c of woCosts) {
      iifRows.push({
        id: c.id,
        date: c.createdAt.toISOString().slice(0, 10),
        type: 'MAINTENANCE_EXPENSE',
        amount: -Math.abs(c.amount), // expense = negative
        memo: `WO: ${c.workOrder?.title ?? ''} - ${c.costType}`,
        propertyName: c.workOrder?.property?.name ?? '',
        tenantName: c.workOrder?.assignedVendor?.name,
        unitNumber: c.workOrder?.unit?.unitNumber,
      })
    }
  }

  const iif = generateIIF(iifRows)
  const scope = propertyId ? (propNameMap.get(propertyId) ?? 'property').replace(/\s+/g, '-') : 'portfolio'
  const filename = `ledger-${scope}-${startDate}-to-${endDate}.iif`

  return new Response(iif, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
