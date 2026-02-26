import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')

  const propertyFilter = propertyId
    ? { id: propertyId }
    : session.user.systemRole === 'MANAGER'
      ? { managerId: session.user.id }
      : {}

  // Get vacant units with their most recent ended lease (to determine vacancy start)
  const vacantUnits = await prisma.unit.findMany({
    where: {
      status: 'AVAILABLE',
      property: propertyFilter,
    },
    include: {
      property: { select: { id: true, name: true } },
      leases: {
        where: { status: { in: ['ENDED', 'TERMINATED'] } },
        orderBy: { endDate: 'desc' },
        take: 1,
      },
    },
    orderBy: [{ property: { name: 'asc' } }],
  })

  const now = new Date()

  const rows = vacantUnits.map(unit => {
    const lastLease = unit.leases[0]
    const vacancyStart = lastLease ? new Date(lastLease.endDate) : new Date(unit.updatedAt)
    const daysVacant = Math.max(0, Math.floor((now.getTime() - vacancyStart.getTime()) / (1000 * 60 * 60 * 24)))
    const monthlyRevenueLoss = unit.monthlyRent

    return {
      id: unit.id,
      unitNumber: unit.unitNumber,
      bedrooms: unit.bedrooms,
      bathrooms: unit.bathrooms,
      monthlyRent: unit.monthlyRent,
      propertyId: unit.propertyId,
      propertyName: unit.property.name,
      vacancyStart: vacancyStart.toISOString(),
      daysVacant,
      revenueLoss: Math.round((daysVacant / 30) * monthlyRevenueLoss * 100) / 100,
    }
  })

  const totalRevenueLoss = rows.reduce((s, r) => s + r.revenueLoss, 0)
  const avgDaysVacant = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.daysVacant, 0) / rows.length) : 0

  return NextResponse.json({
    vacantUnits: rows,
    summary: {
      count: rows.length,
      avgDaysVacant,
      totalMonthlyRevenueLoss: totalRevenueLoss,
    },
  })
}
