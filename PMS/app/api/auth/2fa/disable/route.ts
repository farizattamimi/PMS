import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyToken, verifyBackupCode } from '@/lib/totp'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await req.json()
  if (!code || typeof code !== 'string') {
    return NextResponse.json({ error: 'Code is required' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { twoFactorSecret: true, twoFactorEnabled: true, twoFactorBackupCodes: true },
  })

  if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
    return NextResponse.json({ error: '2FA is not enabled' }, { status: 400 })
  }

  // Accept TOTP or backup code
  const totpValid = verifyToken(code, user.twoFactorSecret)
  const backupIdx = !totpValid ? verifyBackupCode(code, user.twoFactorBackupCodes) : -1
  if (!totpValid && backupIdx === -1) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: [],
    },
  })

  return NextResponse.json({ enabled: false })
}
