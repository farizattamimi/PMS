import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/vendor-portal/profile
 *
 * Returns the vendor profile for the authenticated vendor user.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole !== 'VENDOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const vendor = await prisma.vendor.findUnique({
    where:  { userId: session.user.id },
    include: {
      propertyVendors: { include: { property: { select: { id: true, name: true } } } },
      _count: { select: { workOrders: true, reviews: true } },
    },
  })

  if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  return NextResponse.json(vendor)
}

/**
 * PATCH /api/vendor-portal/profile
 *
 * Vendor updates their own credentialing details.
 * Fields: licenseNumber, licenseExpiry, insuranceCarrier,
 *         insuranceExpiry, insuranceAmount, w9OnFile, phone
 */
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole !== 'VENDOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const vendor = await prisma.vendor.findUnique({
    where: { userId: session.user.id },
  })
  if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })

  const body = await req.json()
  const {
    phone,
    licenseNumber,
    licenseExpiry,
    insuranceCarrier,
    insuranceExpiry,
    insuranceAmount,
    w9OnFile,
  } = body

  const updated = await prisma.vendor.update({
    where: { id: vendor.id },
    data: {
      phone:            phone            ?? undefined,
      licenseNumber:    licenseNumber    ?? undefined,
      licenseExpiry:    licenseExpiry    ? new Date(licenseExpiry)    : undefined,
      insuranceCarrier: insuranceCarrier ?? undefined,
      insuranceExpiry:  insuranceExpiry  ? new Date(insuranceExpiry)  : undefined,
      insuranceAmount:  insuranceAmount  !== undefined ? Number(insuranceAmount) : undefined,
      w9OnFile:         w9OnFile         !== undefined ? Boolean(w9OnFile)       : undefined,
    },
  })

  return NextResponse.json(updated)
}
