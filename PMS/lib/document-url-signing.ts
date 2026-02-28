import crypto from 'crypto'

function signingSecret(): string {
  return process.env.DOCUMENT_URL_SIGNING_SECRET || process.env.NEXTAUTH_SECRET || 'dev-doc-signing-secret'
}

export function signDocumentUrl(docId: string, userId: string, expiresAtMs: number): string {
  const payload = `${docId}.${userId}.${expiresAtMs}`
  const sig = crypto.createHmac('sha256', signingSecret()).update(payload).digest('hex')
  return `${expiresAtMs}.${sig}`
}

export function verifyDocumentUrlSignature(token: string, docId: string, userId: string): boolean {
  const [expiresRaw, sig] = token.split('.', 2)
  if (!expiresRaw || !sig) return false
  const expiresAtMs = Number(expiresRaw)
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) return false
  const expected = signDocumentUrl(docId, userId, expiresAtMs).split('.', 2)[1]
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}
