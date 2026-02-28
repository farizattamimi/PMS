import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const vendor = await prisma.vendor.findUnique({ where: { id: params.id } })
  if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })

  const body = await req.json()
  const { workOrderId, score, quality, responseTime, notes } = body

  if (!workOrderId || score == null || quality == null) {
    return NextResponse.json({ error: 'workOrderId, score, and quality are required' }, { status: 400 })
  }

  // Verify work order belongs to this vendor and is completed
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId } })
  if (!wo || wo.assignedVendorId !== params.id) {
    return NextResponse.json({ error: 'Work order not found or not assigned to this vendor' }, { status: 400 })
  }
  if (wo.status !== 'COMPLETED') {
    return NextResponse.json({ error: 'Can only review completed work orders' }, { status: 400 })
  }

  // Check if already reviewed
  const existing = await prisma.vendorReview.findUnique({ where: { workOrderId } })
  if (existing) {
    return NextResponse.json({ error: 'Work order already reviewed' }, { status: 409 })
  }

  const review = await prisma.vendorReview.create({
    data: {
      vendorId: params.id,
      workOrderId,
      reviewerId: session.user.id,
      score: parseInt(score),
      quality: parseInt(quality),
      responseTime: responseTime ? parseInt(responseTime) : null,
      notes: notes || null,
    },
  })

  // Recompute vendor performance score (avg of all review scores)
  const allReviews = await prisma.vendorReview.findMany({ where: { vendorId: params.id } })
  const avgScore = allReviews.reduce((s, r) => s + r.score, 0) / allReviews.length

  await prisma.vendor.update({
    where: { id: params.id },
    data: {
      performanceScore: Math.round(avgScore * 10) / 10,
      reviewCount: allReviews.length,
    },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'VendorReview',
    entityId: review.id,
    diff: { vendorId: params.id, workOrderId, score, quality },
  })

  return NextResponse.json(review, { status: 201 })
}
