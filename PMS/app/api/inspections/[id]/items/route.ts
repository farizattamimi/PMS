import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const inspection = await prisma.inspection.findUnique({ where: { id: params.id } })
  if (!inspection) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  if (!body.area) return NextResponse.json({ error: 'area required' }, { status: 400 })

  const item = await prisma.inspectionItem.create({
    data: {
      inspectionId: params.id,
      area: body.area,
      condition: body.condition ?? 'GOOD',
      assetId: body.assetId || null,
      notes: body.notes || null,
    },
    include: { asset: { select: { id: true, name: true, category: true } } },
  })

  return NextResponse.json(item, { status: 201 })
}
