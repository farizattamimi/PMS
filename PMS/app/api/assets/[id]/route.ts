import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true } },
    },
  })

  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(asset)
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const asset = await prisma.asset.findUnique({ where: { id: params.id } })
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updateData: any = {}

  const fields = ['name', 'category', 'brand', 'modelNumber', 'serialNumber', 'condition', 'notes', 'replacementCost', 'unitId']
  for (const f of fields) {
    if (body[f] !== undefined) updateData[f] = body[f]
  }
  if (body.installDate !== undefined) updateData.installDate = body.installDate ? new Date(body.installDate) : null
  if (body.warrantyExpiry !== undefined) updateData.warrantyExpiry = body.warrantyExpiry ? new Date(body.warrantyExpiry) : null

  const updated = await prisma.asset.update({ where: { id: params.id }, data: updateData })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'UPDATE',
    entityType: 'Asset',
    entityId: params.id,
    diff: updateData,
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const asset = await prisma.asset.findUnique({ where: { id: params.id } })
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.asset.delete({ where: { id: params.id } })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'DELETE',
    entityType: 'Asset',
    entityId: params.id,
  })

  return NextResponse.json({ ok: true })
}
