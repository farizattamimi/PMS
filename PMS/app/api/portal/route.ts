import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await prisma.tenant.findUnique({
    where: { userId: session.user.id },
    include: {
      leases: {
        orderBy: { startDate: 'desc' },
        include: {
          unit: {
            include: {
              property: { select: { id: true, name: true, address: true, city: true, state: true } },
            },
          },
          ledgerEntries: {
            orderBy: { effectiveDate: 'desc' },
            take: 20,
          },
        },
      },
    },
  })

  if (!tenant) {
    return NextResponse.json({ tenant: null, activeLease: null, balance: 0, workOrders: [] })
  }

  const activeLease = tenant.leases.find(l => l.status === 'ACTIVE') ?? null
  const balance = activeLease
    ? activeLease.ledgerEntries.reduce((sum, e) => sum + e.amount, 0)
    : 0

  // Tenant's work orders
  const workOrders = await prisma.workOrder.findMany({
    where: { submittedById: session.user.id },
    include: {
      property: { select: { name: true } },
      unit: { select: { unitNumber: true } },
      assignedVendor: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  return NextResponse.json({
    tenant,
    activeLease,
    leaseHistory: tenant.leases.filter(l => l.status !== 'ACTIVE'),
    balance,
    workOrders,
  })
}
