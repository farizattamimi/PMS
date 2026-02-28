import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { orgScopeWhere } from '@/lib/access'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')
  const statusFilter = searchParams.get('status') // AVAILABLE | OCCUPIED | DOWN | MODEL

  const orgScope = orgScopeWhere(session)
  const propWhere = session.user.systemRole === 'MANAGER'
    ? { managerId: session.user.id, ...(propertyId ? { id: propertyId } : {}) }
    : propertyId ? { id: propertyId, ...orgScope } : { ...orgScope }

  const units = await prisma.unit.findMany({
    where: {
      property: propWhere,
      ...(statusFilter ? { status: statusFilter as any } : {}),
    },
    include: {
      property: { select: { id: true, name: true, city: true, state: true } },
      building: { select: { name: true } },
      leases: {
        where: { status: 'ACTIVE' },
        include: {
          tenant: { include: { user: { select: { name: true, email: true } } } },
        },
        take: 1,
      },
    },
    orderBy: [{ property: { name: 'asc' } }, { unitNumber: 'asc' }],
  })

  const now = new Date()

  const rows = units.map(u => {
    const activeLease = u.leases[0] ?? null
    const daysUntilExpiry = activeLease
      ? Math.round((new Date(activeLease.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null
    return {
      unitId: u.id,
      unitNumber: u.unitNumber,
      building: u.building?.name ?? null,
      propertyId: u.property.id,
      propertyName: u.property.name,
      city: u.property.city,
      state: u.property.state,
      status: u.status,
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms,
      sqFt: u.sqFt,
      monthlyRent: u.monthlyRent,
      tenant: activeLease ? { name: activeLease.tenant.user.name, email: activeLease.tenant.user.email } : null,
      leaseStart: activeLease?.startDate ?? null,
      leaseEnd: activeLease?.endDate ?? null,
      daysUntilExpiry,
    }
  })

  return NextResponse.json(rows)
}
