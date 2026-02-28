import path from 'path'

const PRIVATE_DOC_PREFIX = 'private:'

export function privateDocumentsDir(): string {
  return path.join(process.cwd(), 'private_uploads', 'documents')
}

export function quarantineDocumentsDir(): string {
  return path.join(process.cwd(), 'private_uploads', 'quarantine')
}

export function makePrivateDocumentRef(fileName: string): string {
  return `${PRIVATE_DOC_PREFIX}${fileName}`
}

export function isPrivateDocumentRef(fileRef: string): boolean {
  return fileRef.startsWith(PRIVATE_DOC_PREFIX)
}

export function resolvePrivateDocumentPath(fileRef: string): string | null {
  if (!isPrivateDocumentRef(fileRef)) return null
  const fileName = fileRef.slice(PRIVATE_DOC_PREFIX.length)
  if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) return null
  return path.join(privateDocumentsDir(), fileName)
}

export function resolveLegacyPublicDocumentPath(fileRef: string): string | null {
  const relative = fileRef.replace(/^\/+/, '')
  const root = path.resolve(path.join(process.cwd(), 'public', 'uploads', 'documents'))
  const full = path.resolve(path.join(process.cwd(), 'public', relative))
  if (!full.startsWith(root + path.sep)) return null
  return full
}
