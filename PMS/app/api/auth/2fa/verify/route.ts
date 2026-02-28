import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyToken, generateBackupCodes, hashBackupCodes } from '@/lib/totp'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await req.json()
  if (!code || typeof code !== 'string') {
    return NextResponse.json({ error: 'Code is required' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { twoFactorSecret: true },
  })

  if (!user?.twoFactorSecret) {
    return NextResponse.json({ error: 'No 2FA setup in progress. Call /api/auth/2fa/setup first.' }, { status: 400 })
  }

  const isValid = verifyToken(code, user.twoFactorSecret)
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid code. Please try again.' }, { status: 400 })
  }

  // Generate backup codes
  const backupCodes = generateBackupCodes()
  const hashedCodes = hashBackupCodes(backupCodes)

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      twoFactorEnabled: true,
      twoFactorBackupCodes: hashedCodes,
    },
  })

  // Return plain backup codes only once — user must save them
  return NextResponse.json({ enabled: true, backupCodes })
}
