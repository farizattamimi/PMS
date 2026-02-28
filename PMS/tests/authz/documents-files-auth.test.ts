import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, rm } from 'fs/promises'
import path from 'path'
import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { sessionProvider } from '@/lib/session-provider'
import { GET as documentFileGET } from '@/app/api/documents/files/[id]/route'
import { signDocumentUrl } from '@/lib/document-url-signing'
import { privateDocumentsDir } from '@/lib/document-storage'

function makeSession(role: 'ADMIN' | 'MANAGER' | 'TENANT', id: string): Session {
  return {
    user: { id, systemRole: role, name: null, email: null, image: null, orgId: null },
    expires: '2099-01-01T00:00:00.000Z',
  }
}

test('GET /api/documents/files/[id] rejects invalid token', async () => {
  const originalGetSession = sessionProvider.getSession
  try {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    const res = await documentFileGET(
      new Request('http://localhost/api/documents/files/doc-1?token=bad'),
      { params: { id: 'doc-1' } }
    )
    assert.equal(res.status, 403)
  } finally {
    sessionProvider.getSession = originalGetSession
  }
})

test('GET /api/documents/files/[id] rejects user-mismatched token', async () => {
  const originalGetSession = sessionProvider.getSession
  try {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    const token = signDocumentUrl('doc-1', 'mgr-other', Date.now() + 60_000)
    const res = await documentFileGET(
      new Request(`http://localhost/api/documents/files/doc-1?token=${encodeURIComponent(token)}`),
      { params: { id: 'doc-1' } }
    )
    assert.equal(res.status, 403)
  } finally {
    sessionProvider.getSession = originalGetSession
  }
})

test('GET /api/documents/files/[id] enforces document scope', async () => {
  const originalGetSession = sessionProvider.getSession
  const originalFindFirst = (prisma.document as any).findFirst
  try {
    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.document as any).findFirst = async () => null
    const token = signDocumentUrl('doc-1', 'mgr-1', Date.now() + 60_000)
    const res = await documentFileGET(
      new Request(`http://localhost/api/documents/files/doc-1?token=${encodeURIComponent(token)}`),
      { params: { id: 'doc-1' } }
    )
    assert.equal(res.status, 404)
  } finally {
    sessionProvider.getSession = originalGetSession
    ;(prisma.document as any).findFirst = originalFindFirst
  }
})

test('GET /api/documents/files/[id] serves private file when token and scope are valid', async () => {
  const originalGetSession = sessionProvider.getSession
  const originalFindFirst = (prisma.document as any).findFirst
  const dir = privateDocumentsDir()
  const fileName = 'test-doc.txt'
  const filePath = path.join(dir, fileName)
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(filePath, Buffer.from('hello'))

    sessionProvider.getSession = async () => makeSession('MANAGER', 'mgr-1')
    ;(prisma.document as any).findFirst = async () => ({
      id: 'doc-1',
      fileName: 'test-doc.txt',
      fileUrl: `private:${fileName}`,
    })
    const token = signDocumentUrl('doc-1', 'mgr-1', Date.now() + 60_000)
    const res = await documentFileGET(
      new Request(`http://localhost/api/documents/files/doc-1?token=${encodeURIComponent(token)}`),
      { params: { id: 'doc-1' } }
    )
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'private, no-store')
    const text = await res.text()
    assert.equal(text, 'hello')
  } finally {
    sessionProvider.getSession = originalGetSession
    ;(prisma.document as any).findFirst = originalFindFirst
    await rm(filePath, { force: true })
  }
})
