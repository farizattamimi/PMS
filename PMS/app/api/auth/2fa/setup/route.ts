import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateSecret, generateQRCodeDataURL } from '@/lib/totp'
import { checkRateLimit, rateLimitHeaders, resolveRateLimitKey } from '@/lib/rate-limit'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limit: 5 setup attempts per 15 minutes
  const rl = await checkRateLimit({
    bucket: '2fa-setup',
    key: resolveRateLimitKey(req, session.user.id),
    limit: 5,
    windowMs: 15 * 60 * 1000,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl) }
    )
  }

  const secret = generateSecret()
  const qrCodeUrl = await generateQRCodeDataURL(secret, session.user.email ?? '')

  // Save secret but don't enable yet — user must verify first
  await prisma.user.update({
    where: { id: session.user.id },
    data: { twoFactorSecret: secret, twoFactorEnabled: false },
  })

  return NextResponse.json({ secret, qrCodeUrl })
}
