import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { sessionProvider } from '@/lib/session-provider'
import { documentScopeWhereAsync } from '@/lib/access'
import { resolveLegacyPublicDocumentPath, resolvePrivateDocumentPath } from '@/lib/document-storage'
import { verifyDocumentUrlSignature } from '@/lib/document-url-signing'
import { checkRateLimit, rateLimitHeaders, resolveRateLimitKey } from '@/lib/rate-limit'

function contentTypeFromName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'pdf':
      return 'application/pdf'
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'csv':
      return 'text/csv; charset=utf-8'
    case 'txt':
      return 'text/plain; charset=utf-8'
    case 'doc':
      return 'application/msword'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    default:
      return 'application/octet-stream'
  }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = new URL(req.url).searchParams.get('token')
  if (!token || !verifyDocumentUrlSignature(token, params.id, session.user.id)) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 403 })
  }
  const rate = await checkRateLimit({
    bucket: 'documents-download',
    key: resolveRateLimitKey(req, session.user.id),
    limit: 180,
    windowMs: 60_000,
  })
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please retry shortly.' },
      { status: 429, headers: rateLimitHeaders(rate) }
    )
  }

  const scopeWhere = await documentScopeWhereAsync(session)
  if (!scopeWhere) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const doc = await prisma.document.findFirst({
    where: { id: params.id, ...scopeWhere },
    select: { id: true, fileName: true, fileUrl: true },
  })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const privatePath = resolvePrivateDocumentPath(doc.fileUrl)
  const legacyPath = privatePath ? null : resolveLegacyPublicDocumentPath(doc.fileUrl)
  const filePath = privatePath ?? legacyPath
  if (!filePath) return NextResponse.json({ error: 'Document path is invalid' }, { status: 500 })

  try {
    const buf = await readFile(filePath)
    const headers = rateLimitHeaders(rate)
    headers['Content-Type'] = contentTypeFromName(doc.fileName)
    headers['Content-Disposition'] = `inline; filename="${doc.fileName.replace(/"/g, '')}"`
    headers['Cache-Control'] = 'private, no-store'
    return new Response(buf, { status: 200, headers })
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
