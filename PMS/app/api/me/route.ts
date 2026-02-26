import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      systemRole: true,
      isActive: true,
      org: { select: { id: true, name: true, type: true, status: true } },
      managedProperties: { select: { id: true, name: true, city: true, state: true, status: true } },
      tenant: {
        select: {
          id: true,
          property: { select: { id: true, name: true } },
          leases: {
            where: { status: 'ACTIVE' },
            select: { id: true, status: true, endDate: true, monthlyRent: true, unit: { select: { unitNumber: true } } },
            take: 1,
          },
        },
      },
    },
  })

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(user)
}
