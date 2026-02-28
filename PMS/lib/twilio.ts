import twilio from 'twilio'

let _client: ReturnType<typeof twilio> | null | undefined

export function getTwilio(): ReturnType<typeof twilio> | null {
  if (_client !== undefined) return _client
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  _client = sid && token ? twilio(sid, token) : null
  return _client
}

export const SMS_FROM = process.env.TWILIO_PHONE_NUMBER ?? ''
