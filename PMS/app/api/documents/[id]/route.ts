import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { unlink } from 'fs/promises'
import path from 'path'
import { isAdmin, isManager } from '@/lib/access'
import { sessionProvider } from '@/lib/session-provider'

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const doc = await prisma.document.findUnique({
    where: { id: params.id },
    include: {
      property: { select: { managerId: true } },
      workOrder: { select: { property: { select: { managerId: true } } } },
    },
  })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!isAdmin(session)) {
    if (!isManager(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const canManageProperty =
      doc.property?.managerId === session.user.id ||
      doc.workOrder?.property?.managerId === session.user.id
    const canDeleteOwnUpload = doc.uploadedById === session.user.id
    if (!canManageProperty && !canDeleteOwnUpload) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  // Delete file from disk
  try {
    const relativeFilePath = doc.fileUrl.replace(/^\/+/, '')
    const filePath = path.join(process.cwd(), 'public', relativeFilePath)
    await unlink(filePath)
  } catch {
    // File may already be gone — continue
  }

  await prisma.document.delete({ where: { id: params.id } })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'DELETE',
    entityType: 'Document',
    entityId: params.id,
    diff: { fileName: doc.fileName },
  })

  return NextResponse.json({ success: true })
}
