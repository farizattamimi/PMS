import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { vendorId } = await req.json()
  if (!vendorId) return NextResponse.json({ error: 'vendorId required' }, { status: 400 })

  const link = await prisma.propertyVendor.upsert({
    where: { propertyId_vendorId: { propertyId: params.id, vendorId } },
    update: {},
    create: { propertyId: params.id, vendorId },
  })

  return NextResponse.json(link, { status: 201 })
}
