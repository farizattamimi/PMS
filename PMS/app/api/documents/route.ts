import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { sessionProvider } from '@/lib/session-provider'
import {
  documentScopeWhere,
  propertyScopeWhere,
  workOrderScopeWhere,
  isTenant,
} from '@/lib/access'

export async function GET(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isTenant(session)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scopeWhere = documentScopeWhere(session)
  if (!scopeWhere) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')
  const scopeType = searchParams.get('scopeType')
  const scopeId = searchParams.get('scopeId')

  const where: any = { ...scopeWhere }
  if (propertyId) where.propertyId = propertyId
  if (scopeType) where.scopeType = scopeType
  if (scopeId) where.scopeId = scopeId

  const docs = await prisma.document.findMany({
    where,
    include: { uploadedBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(docs)
}

export async function POST(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isTenant(session)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const scopeType = formData.get('scopeType') as string
  const scopeId = formData.get('scopeId') as string
  const propertyId = formData.get('propertyId') as string | null
  const workOrderId = formData.get('workOrderId') as string | null

  if (!file || !scopeType || !scopeId) {
    return NextResponse.json({ error: 'file, scopeType, and scopeId are required' }, { status: 400 })
  }

  let resolvedPropertyId = propertyId || null
  const resolvedWorkOrderId = workOrderId || null

  if (resolvedWorkOrderId) {
    const workOrder = await prisma.workOrder.findFirst({
      where: {
        id: resolvedWorkOrderId,
        ...workOrderScopeWhere(session),
      },
      select: { propertyId: true },
    })
    if (!workOrder) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (resolvedPropertyId && resolvedPropertyId !== workOrder.propertyId) {
      return NextResponse.json({ error: 'propertyId does not match workOrderId' }, { status: 400 })
    }
    resolvedPropertyId = workOrder.propertyId
  }

  if (resolvedPropertyId) {
    const property = await prisma.property.findFirst({
      where: {
        id: resolvedPropertyId,
        ...propertyScopeWhere(session),
      },
      select: { id: true },
    })
    if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!resolvedPropertyId && !resolvedWorkOrderId) {
    return NextResponse.json({ error: 'propertyId or workOrderId is required' }, { status: 400 })
  }

  // Save file to public/uploads/documents/
  const ext = file.name.split('.').pop() ?? 'bin'
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'documents')
  await mkdir(uploadDir, { recursive: true })
  const filePath = path.join(uploadDir, safeName)
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buffer)

  const fileUrl = `/uploads/documents/${safeName}`

  const doc = await prisma.document.create({
    data: {
      scopeType,
      scopeId,
      fileUrl,
      fileName: file.name,
      uploadedById: session.user.id,
      propertyId: resolvedPropertyId,
      workOrderId: resolvedWorkOrderId,
    },
    include: { uploadedBy: { select: { name: true } } },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'Document',
    entityId: doc.id,
    diff: { fileName: file.name, scopeType, scopeId },
  })

  return NextResponse.json(doc, { status: 201 })
}
