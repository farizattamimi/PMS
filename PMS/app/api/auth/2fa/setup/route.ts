import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateSecret, generateQRCodeDataURL } from '@/lib/totp'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const secret = generateSecret()
  const qrCodeUrl = await generateQRCodeDataURL(secret, session.user.email ?? '')

  // Save secret but don't enable yet — user must verify first
  await prisma.user.update({
    where: { id: session.user.id },
    data: { twoFactorSecret: secret, twoFactorEnabled: false },
  })

  return NextResponse.json({ secret, qrCodeUrl })
}
