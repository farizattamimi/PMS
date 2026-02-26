import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/portal/tenants?propertyId=...
 *
 * Returns tenants with active or draft leases on the given property.
 * Manager/Admin only.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')
  if (!propertyId) {
    return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
  }

  // Manager scope
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      ...(session.user.systemRole === 'MANAGER' ? { managerId: session.user.id } : {}),
    },
    select: { id: true },
  })
  if (!property) {
    return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 })
  }

  const leases = await prisma.lease.findMany({
    where: {
      propertyId,
      status: { in: ['ACTIVE', 'DRAFT'] },
    },
    include: {
      tenant: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      unit: { select: { unitNumber: true } },
    },
  })

  // Deduplicate by tenant userId (in case of multiple leases)
  const seen = new Set<string>()
  const result = leases
    .filter(l => {
      if (seen.has(l.tenant.userId)) return false
      seen.add(l.tenant.userId)
      return true
    })
    .map(l => ({
      userId:     l.tenant.userId,
      name:       l.tenant.user.name,
      email:      l.tenant.user.email,
      unitNumber: l.unit.unitNumber,
    }))

  return NextResponse.json(result)
}
