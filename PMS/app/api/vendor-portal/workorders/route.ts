import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/vendor-portal/workorders
 *
 * Returns all work orders assigned to the authenticated vendor.
 * Query params:
 *   status — filter by WO status (optional)
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole !== 'VENDOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Resolve vendor record linked to this user
  const vendor = await prisma.vendor.findUnique({
    where:  { userId: session.user.id },
    select: { id: true },
  })
  if (!vendor) return NextResponse.json({ error: 'Vendor record not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? undefined

  const where: Record<string, unknown> = { assignedVendorId: vendor.id }
  if (status) where.status = status

  const workOrders = await prisma.workOrder.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      property: { select: { id: true, name: true } },
      unit:     { select: { unitNumber: true } },
    },
  })

  return NextResponse.json(workOrders)
}
