import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: Request, { params }: { params: { id: string; itemId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const item = await prisma.inspectionItem.findUnique({ where: { id: params.itemId } })
  if (!item || item.inspectionId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const updateData: any = {}
  if (body.condition !== undefined) updateData.condition = body.condition
  if (body.notes !== undefined) updateData.notes = body.notes
  if (body.photoDocId !== undefined) updateData.photoDocId = body.photoDocId
  if (body.area !== undefined) updateData.area = body.area

  const updated = await prisma.inspectionItem.update({ where: { id: params.itemId }, data: updateData })
  return NextResponse.json(updated)
}

export async function DELETE(req: Request, { params }: { params: { id: string; itemId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const item = await prisma.inspectionItem.findUnique({ where: { id: params.itemId } })
  if (!item || item.inspectionId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.inspectionItem.delete({ where: { id: params.itemId } })
  return NextResponse.json({ ok: true })
}
