import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole !== 'OWNER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Find the owner's org
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { orgId: true },
  })
  if (!user?.orgId) {
    return NextResponse.json({ error: 'No organization linked' }, { status: 400 })
  }

  const properties = await prisma.property.findMany({
    where: { ownerOrgId: user.orgId },
    include: {
      units: { select: { id: true, status: true, monthlyRent: true } },
      ledgerEntries: {
        where: {
          effectiveDate: { gte: new Date(new Date().getFullYear(), 0, 1) },
        },
        select: { amount: true, type: true },
      },
      distributions: {
        where: { ownerOrgId: user.orgId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  })

  let totalUnits = 0
  let occupiedUnits = 0
  let totalNOI = 0
  let ytdDistributionsPaid = 0

  const propertyData = properties.map(p => {
    const total = p.units.length
    const occupied = p.units.filter(u => u.status === 'OCCUPIED').length
    const occupancy = total > 0 ? Math.round((occupied / total) * 100) : 0

    const income = p.ledgerEntries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0)
    const expenses = p.ledgerEntries.filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)
    const noi = income - expenses

    totalUnits += total
    occupiedUnits += occupied
    totalNOI += noi

    const paidDists = p.distributions.filter(d => d.status === 'PAID')
    const paidTotal = paidDists.reduce((s, d) => s + d.netDistribution, 0)
    ytdDistributionsPaid += paidTotal

    return {
      id: p.id,
      name: p.name,
      address: p.address,
      city: p.city,
      state: p.state,
      totalUnits: total,
      occupiedUnits: occupied,
      occupancy,
      monthlyNOI: Math.round(noi / 12),
      recentDistributions: p.distributions.map(d => ({
        id: d.id,
        period: d.period,
        grossIncome: d.grossIncome,
        expenses: d.expenses,
        managementFee: d.managementFee,
        netDistribution: d.netDistribution,
        status: d.status,
      })),
    }
  })

  const avgOccupancy = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0

  return NextResponse.json({
    stats: {
      totalProperties: properties.length,
      totalUnits,
      avgOccupancy,
      totalNOI: Math.round(totalNOI),
      ytdDistributionsPaid: Math.round(ytdDistributionsPaid),
    },
    properties: propertyData,
  })
}
