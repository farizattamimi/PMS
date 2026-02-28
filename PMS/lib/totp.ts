import { generateSecret as otpGenerateSecret, generateSync, generateURI, verifySync } from 'otplib'
import QRCode from 'qrcode'
import crypto from 'crypto'

const APP_NAME = 'PMS'

/** Generate a new TOTP secret */
export function generateSecret(): string {
  return otpGenerateSecret()
}

/** Generate a QR code data URL for a given secret + user email */
export async function generateQRCodeDataURL(secret: string, email: string): Promise<string> {
  const uri = generateURI({ issuer: APP_NAME, label: email, secret })
  return QRCode.toDataURL(uri)
}

/** Verify a TOTP token against a secret */
export function verifyToken(token: string, secret: string): boolean {
  try {
    const result = verifySync({ token, secret })
    return (result as any).valid === true
  } catch {
    return false
  }
}

/** Generate a TOTP token for a secret (used in tests) */
export function generateToken(secret: string): string {
  return generateSync({ secret })
}

/** Generate 10 backup codes (8-char hex) */
export function generateBackupCodes(): string[] {
  const codes: string[] = []
  for (let i = 0; i < 10; i++) {
    codes.push(crypto.randomBytes(4).toString('hex'))
  }
  return codes
}

/** Hash backup codes for safe storage */
export function hashBackupCodes(codes: string[]): string[] {
  return codes.map(code => crypto.createHash('sha256').update(code).digest('hex'))
}

/** Verify a backup code against a list of hashed codes. Returns the index if found, -1 otherwise. */
export function verifyBackupCode(code: string, hashedCodes: string[]): number {
  const hash = crypto.createHash('sha256').update(code).digest('hex')
  return hashedCodes.indexOf(hash)
}
