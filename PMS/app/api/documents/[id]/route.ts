import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { unlink } from 'fs/promises'
import { isAdmin, isManager } from '@/lib/access'
import { sessionProvider } from '@/lib/session-provider'
import { checkRateLimit, rateLimitHeaders, resolveRateLimitKey } from '@/lib/rate-limit'
import { resolveLegacyPublicDocumentPath, resolvePrivateDocumentPath } from '@/lib/document-storage'

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rate = await checkRateLimit({
    bucket: 'documents-delete',
    key: resolveRateLimitKey(req, session.user.id),
    limit: 30,
    windowMs: 60_000,
  })
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please retry shortly.' },
      { status: 429, headers: rateLimitHeaders(rate) }
    )
  }

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
    const privatePath = resolvePrivateDocumentPath(doc.fileUrl)
    const legacyPath = privatePath ? null : resolveLegacyPublicDocumentPath(doc.fileUrl)
    const filePath = privatePath ?? legacyPath
    if (filePath) await unlink(filePath)
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

  return NextResponse.json({ success: true }, { headers: rateLimitHeaders(rate) })
}
