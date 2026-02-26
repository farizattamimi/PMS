import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(req: Request, { params }: { params: { id: string; vendorId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await prisma.propertyVendor.deleteMany({
    where: { propertyId: params.id, vendorId: params.vendorId },
  })

  return NextResponse.json({ success: true })
}
