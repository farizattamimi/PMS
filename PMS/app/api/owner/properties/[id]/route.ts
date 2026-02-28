import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole !== 'OWNER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { orgId: true },
  })
  if (!user?.orgId) {
    return NextResponse.json({ error: 'No organization linked' }, { status: 400 })
  }

  const property = await prisma.property.findFirst({
    where: { id: params.id, ownerOrgId: user.orgId },
    include: {
      units: { select: { id: true, unitNumber: true, status: true, monthlyRent: true, sqFt: true, bedrooms: true, bathrooms: true } },
      leases: {
        where: { status: 'ACTIVE' },
        select: { id: true, monthlyRent: true, startDate: true, endDate: true, unit: { select: { unitNumber: true } }, tenant: { include: { user: { select: { name: true } } } } },
      },
      ledgerEntries: {
        orderBy: { effectiveDate: 'desc' },
        take: 50,
        select: { id: true, type: true, amount: true, effectiveDate: true, memo: true },
      },
      distributions: {
        where: { ownerOrgId: user.orgId },
        orderBy: { createdAt: 'desc' },
        take: 12,
      },
    },
  })

  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const totalUnits = property.units.length
  const occupied = property.units.filter(u => u.status === 'OCCUPIED').length
  const occupancy = totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0
  const totalPotentialRent = property.units.reduce((s, u) => s + u.monthlyRent, 0)
  const totalCollectedRent = property.leases.reduce((s, l) => s + l.monthlyRent, 0)

  const income = property.ledgerEntries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0)
  const expenses = property.ledgerEntries.filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)

  return NextResponse.json({
    id: property.id,
    name: property.name,
    address: property.address,
    city: property.city,
    state: property.state,
    totalUnits,
    occupied,
    occupancy,
    totalPotentialRent,
    totalCollectedRent,
    income,
    expenses,
    noi: income - expenses,
    units: property.units,
    leases: property.leases,
    recentLedger: property.ledgerEntries,
    distributions: property.distributions,
  })
}
