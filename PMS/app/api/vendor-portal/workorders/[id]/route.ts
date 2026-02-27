import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/vendor-portal/workorders/[id]
 *
 * Returns full detail for one WO, only if assigned to this vendor.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole !== 'VENDOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const vendor = await prisma.vendor.findUnique({
    where:  { userId: session.user.id },
    select: { id: true },
  })
  if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })

  const wo = await prisma.workOrder.findFirst({
    where:   { id: params.id, assignedVendorId: vendor.id },
    include: {
      property: { select: { id: true, name: true, address: true } },
      unit:     { select: { unitNumber: true } },
      costs:    { select: { costType: true, memo: true, amount: true, createdAt: true } },
    },
  })

  if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  return NextResponse.json(wo)
}

/**
 * PATCH /api/vendor-portal/workorders/[id]
 *
 * Vendor updates status, sign-off notes, or block reason.
 * Allowed status transitions:
 *   ASSIGNED    → IN_PROGRESS
 *   IN_PROGRESS → COMPLETED | BLOCKED
 *   BLOCKED     → IN_PROGRESS
 *
 * Body: { status?: string, signOffNotes?: string }
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole !== 'VENDOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const vendor = await prisma.vendor.findUnique({
    where:  { userId: session.user.id },
    select: { id: true },
  })
  if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })

  const wo = await prisma.workOrder.findFirst({
    where: { id: params.id, assignedVendorId: vendor.id },
  })
  if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

  const body = await req.json()
  const { status, signOffNotes } = body as { status?: string; signOffNotes?: string }

  // Validate allowed transitions
  const ALLOWED: Record<string, string[]> = {
    ASSIGNED:    ['IN_PROGRESS'],
    IN_PROGRESS: ['COMPLETED', 'BLOCKED'],
    BLOCKED:     ['IN_PROGRESS'],
  }

  const updateData: Record<string, unknown> = {}

  if (status) {
    const allowed = ALLOWED[wo.status] ?? []
    if (!allowed.includes(status)) {
      return NextResponse.json(
        { error: `Cannot transition from ${wo.status} to ${status}` },
        { status: 422 }
      )
    }
    updateData.status = status
    if (status === 'COMPLETED') {
      updateData.completedAt = new Date()
      if (signOffNotes) updateData.signOffNotes = signOffNotes
    }
  }

  if (signOffNotes && !status) {
    updateData.signOffNotes = signOffNotes
  }

  const updated = await prisma.workOrder.update({
    where: { id: params.id },
    data:  updateData,
  })

  return NextResponse.json(updated)
}
