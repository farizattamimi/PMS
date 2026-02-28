import { Resend } from 'resend'

let _resend: Resend | null | undefined

export function getResend(): Resend | null {
  if (_resend !== undefined) return _resend
  const key = process.env.RESEND_API_KEY
  _resend = key ? new Resend(key) : null
  return _resend
}

export const EMAIL_FROM = process.env.EMAIL_FROM ?? 'noreply@pms.app'
