import crypto from 'crypto'

export function verifyHmacSha256Signature(
  body: string,
  signatureHeader: string | null,
  secret: string,
  timestamp?: string | null,
  maxSkewSeconds = 300
): boolean {
  if (!signatureHeader) return false

  if (timestamp) {
    const ts = Number(timestamp)
    if (!Number.isFinite(ts)) return false
    const nowSec = Math.floor(Date.now() / 1000)
    if (Math.abs(nowSec - ts) > maxSkewSeconds) return false
  }

  const payload = timestamp ? `${timestamp}.${body}` : body
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  const candidate = signatureHeader.replace(/^sha256=/i, '')
  try {
    return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected))
  } catch {
    return false
  }
}
