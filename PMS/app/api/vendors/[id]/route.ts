import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { isManager } from '@/lib/access'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const vendor = await prisma.vendor.findUnique({
    where: { id: params.id },
    include: {
      propertyVendors: { include: { property: { select: { id: true, name: true, managerId: true } } } },
      workOrders: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { property: { select: { name: true } } },
      },
      reviews: {
        orderBy: { createdAt: 'desc' },
        include: { workOrder: { select: { id: true, title: true, completedAt: true } } },
      },
      _count: { select: { workOrders: true } },
    },
  })

  if (!vendor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Manager can only see vendors linked to their properties
  if (isManager(session)) {
    const linkedToManaged = vendor.propertyVendors.some(
      (pv: any) => pv.property?.managerId === session.user.id
    )
    if (!linkedToManaged) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  return NextResponse.json(vendor)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const vendor = await prisma.vendor.findUnique({
    where: { id: params.id },
    include: { propertyVendors: { select: { property: { select: { managerId: true } } } } },
  })
  if (!vendor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (isManager(session)) {
    const linkedToManaged = vendor.propertyVendors.some(
      (pv: any) => pv.property?.managerId === session.user.id
    )
    if (!linkedToManaged) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const body = await req.json()
  const {
    name, email, phone, serviceCategories, status,
    licenseNumber, licenseExpiry, insuranceCarrier, insuranceExpiry, insuranceAmount, w9OnFile,
  } = body

  const updateData: any = {}
  if (name !== undefined) updateData.name = name
  if (email !== undefined) updateData.email = email
  if (phone !== undefined) updateData.phone = phone
  if (serviceCategories !== undefined) updateData.serviceCategories = serviceCategories
  if (status !== undefined) updateData.status = status
  if (licenseNumber !== undefined) updateData.licenseNumber = licenseNumber
  if (licenseExpiry !== undefined) updateData.licenseExpiry = licenseExpiry ? new Date(licenseExpiry) : null
  if (insuranceCarrier !== undefined) updateData.insuranceCarrier = insuranceCarrier
  if (insuranceExpiry !== undefined) updateData.insuranceExpiry = insuranceExpiry ? new Date(insuranceExpiry) : null
  if (insuranceAmount !== undefined) updateData.insuranceAmount = insuranceAmount ? parseFloat(insuranceAmount) : null
  if (w9OnFile !== undefined) updateData.w9OnFile = w9OnFile

  const updated = await prisma.vendor.update({
    where: { id: params.id },
    data: updateData,
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'UPDATE',
    entityType: 'Vendor',
    entityId: params.id,
    diff: updateData,
  })

  return NextResponse.json(updated)
}
