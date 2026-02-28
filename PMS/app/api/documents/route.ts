import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { documentQueries } from '@/lib/documents-data'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { sessionProvider } from '@/lib/session-provider'
import { makePrivateDocumentRef, privateDocumentsDir } from '@/lib/document-storage'
import { signDocumentUrl } from '@/lib/document-url-signing'
import { quarantineUpload, scanUpload } from '@/lib/malware-scan'
import {
  assertManagerOwnsProperty,
  documentScopeWhereAsync,
  isAdmin,
  isTenant,
  isVendor,
  vendorIdForUser,
} from '@/lib/access'
import { checkRateLimit, rateLimitHeaders, resolveRateLimitKey } from '@/lib/rate-limit'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'txt',
  'csv',
  'doc',
  'docx',
])
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const SIGNED_URL_TTL_MS = 60 * 60 * 1000

function withSignedDocumentUrl<T extends { id: string; fileUrl: string }>(doc: T, userId: string): T {
  const expiresAt = Date.now() + SIGNED_URL_TTL_MS
  const token = signDocumentUrl(doc.id, userId, expiresAt)
  return {
    ...doc,
    fileUrl: `/api/documents/files/${doc.id}?token=${encodeURIComponent(token)}`,
  }
}

export async function GET(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rate = await checkRateLimit({
    bucket: 'documents-list',
    key: resolveRateLimitKey(req, session.user.id),
    limit: 120,
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

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')
  const scopeType = searchParams.get('scopeType')
  const scopeId = searchParams.get('scopeId')

  const where: any = { ...scopeWhere }
  if (propertyId) where.propertyId = propertyId
  if (scopeType) where.scopeType = scopeType
  if (scopeId) where.scopeId = scopeId

  const docs = await documentQueries.findMany({
    where,
    include: { uploadedBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const decorated = docs.map((doc: any) => withSignedDocumentUrl(doc, session.user.id))
  return NextResponse.json(decorated, { headers: rateLimitHeaders(rate) })
}

export async function POST(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rate = await checkRateLimit({
    bucket: 'documents-upload',
    key: resolveRateLimitKey(req, session.user.id),
    limit: 25,
    windowMs: 60_000,
  })
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please retry shortly.' },
      { status: 429, headers: rateLimitHeaders(rate) }
    )
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const scopeType = formData.get('scopeType') as string
  const scopeId = formData.get('scopeId') as string
  const propertyId = formData.get('propertyId') as string | null
  const workOrderId = formData.get('workOrderId') as string | null

  if (!file || !scopeType || !scopeId) {
    return NextResponse.json({ error: 'file, scopeType, and scopeId are required' }, { status: 400 })
  }

  // TENANT and VENDOR can only upload to work orders they own/are assigned to
  if (isTenant(session)) {
    if (scopeType !== 'workorder' || !workOrderId) {
      return NextResponse.json({ error: 'Tenants can only upload to work orders' }, { status: 403 })
    }
    const wo = await prisma.workOrder.findFirst({
      where: { id: workOrderId, submittedById: session.user.id },
      select: { propertyId: true },
    })
    if (!wo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return await saveDocument({ file, scopeType, scopeId, propertyId: wo.propertyId, workOrderId, session })
  }

  if (isVendor(session)) {
    if (scopeType !== 'workorder' || !workOrderId) {
      return NextResponse.json({ error: 'Vendors can only upload to work orders' }, { status: 403 })
    }
    const vendorId = await vendorIdForUser(session.user.id)
    if (!vendorId) return NextResponse.json({ error: 'Vendor record not found' }, { status: 404 })

    const wo = await prisma.workOrder.findFirst({
      where: { id: workOrderId, assignedVendorId: vendorId },
      select: { propertyId: true },
    })
    if (!wo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return await saveDocument({ file, scopeType, scopeId, propertyId: wo.propertyId, workOrderId, session })
  }

  // Manager / Admin path — original logic
  let resolvedPropertyId = propertyId || null
  const resolvedWorkOrderId = workOrderId || null

  if (resolvedWorkOrderId) {
    const workOrder = await prisma.workOrder.findFirst({
      where: {
        id: resolvedWorkOrderId,
        ...(isAdmin(session) ? {} : { property: { managerId: session.user.id } }),
      },
      select: { propertyId: true },
    })
    if (!workOrder) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (resolvedPropertyId && resolvedPropertyId !== workOrder.propertyId) {
      return NextResponse.json({ error: 'propertyId does not match workOrderId' }, { status: 400 })
    }
    resolvedPropertyId = workOrder.propertyId
  }

  if (!resolvedPropertyId && !resolvedWorkOrderId) {
    return NextResponse.json({ error: 'propertyId or workOrderId is required' }, { status: 400 })
  }
  if (resolvedPropertyId && !isAdmin(session)) {
    const canAccessProperty = await assertManagerOwnsProperty(session, resolvedPropertyId)
    if (!canAccessProperty) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return await saveDocument(
    { file, scopeType, scopeId, propertyId: resolvedPropertyId, workOrderId: resolvedWorkOrderId, session },
    rateLimitHeaders(rate)
  )
}

async function saveDocument({
  file,
  scopeType,
  scopeId,
  propertyId,
  workOrderId,
  session,
}: {
  file: File
  scopeType: string
  scopeId: string
  propertyId: string | null
  workOrderId: string | null
  session: any
}, headers?: Record<string, string>) {
  if (!file.size || file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `file size must be between 1 byte and ${MAX_UPLOAD_BYTES} bytes` },
      { status: 400, headers }
    )
  }

  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ error: 'file extension not allowed' }, { status: 400, headers })
  }

  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'file type not allowed' }, { status: 400, headers })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const scanResult = await scanUpload(buffer, file.name, file.type || 'application/octet-stream')
  if (scanResult.verdict !== 'CLEAN') {
    await quarantineUpload(buffer, file.name)
    const status = scanResult.verdict === 'SUSPICIOUS' ? 400 : 503
    return NextResponse.json(
      { error: `File rejected by malware scan (${scanResult.reason ?? scanResult.verdict})` },
      { status, headers }
    )
  }

  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const uploadDir = privateDocumentsDir()
  await mkdir(uploadDir, { recursive: true })
  const filePath = path.join(uploadDir, safeName)
  await writeFile(filePath, buffer)

  const fileUrl = makePrivateDocumentRef(safeName)

  const created = await prisma.document.create({
    data: {
      scopeType,
      scopeId,
      fileUrl,
      fileName: file.name,
      uploadedById: session.user.id,
      propertyId,
      workOrderId,
    },
    include: { uploadedBy: { select: { name: true } } },
  })
  const doc = withSignedDocumentUrl(created as any, session.user.id)

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'Document',
    entityId: created.id,
    diff: { fileName: file.name, scopeType, scopeId },
  })

  return NextResponse.json(doc, { status: 201, headers })
}
