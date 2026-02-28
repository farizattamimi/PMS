import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { sessionProvider } from '@/lib/session-provider'
import { isAdmin, isManager, isTenant, tenantIdForUser } from '@/lib/access'
import { generateLeasePdf } from '@/lib/lease-pdf'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { makePrivateDocumentRef, privateDocumentsDir } from '@/lib/document-storage'
import { signDocumentUrl } from '@/lib/document-url-signing'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const lease = await prisma.lease.findUnique({
    where: { id: params.id },
    include: {
      tenant: { include: { user: { select: { name: true, email: true } } } },
      unit: {
        include: {
          property: {
            include: { org: { select: { name: true } } },
          },
        },
      },
    },
  })
  if (!lease) return NextResponse.json({ error: 'Lease not found' }, { status: 404 })

  const property = lease.unit.property

  // Access check
  if (isTenant(session)) {
    const tenantId = await tenantIdForUser(session.user.id)
    if (lease.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else if (isManager(session)) {
    if (property.managerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Generate PDF
  const pdfBuffer = await generateLeasePdf(lease as any)

  // Save to disk
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`
  const uploadDir = privateDocumentsDir()
  await mkdir(uploadDir, { recursive: true })
  const filePath = path.join(uploadDir, safeName)
  await writeFile(filePath, pdfBuffer)

  const fileRef = makePrivateDocumentRef(safeName)
  const fileName = `Lease-${lease.unit.unitNumber}-${lease.tenant.user.name.replace(/\s+/g, '_')}.pdf`

  // Create Document record
  const doc = await prisma.document.create({
    data: {
      scopeType: 'lease',
      scopeId: lease.id,
      fileUrl: fileRef,
      fileName,
      uploadedById: session.user.id,
      propertyId: property.id,
    },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'Document',
    entityId: doc.id,
    diff: { fileName, scopeType: 'lease', scopeId: lease.id },
  })

  const expiresAt = Date.now() + 60 * 60 * 1000
  const token = signDocumentUrl(doc.id, session.user.id, expiresAt)
  const fileUrl = `/api/documents/files/${doc.id}?token=${encodeURIComponent(token)}`
  return NextResponse.json({ documentId: doc.id, fileUrl }, { status: 201 })
}
