import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'

// GET — fetch org branding (any authenticated user with orgId)
export async function GET() {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = (session.user as any).orgId
  if (!orgId) return NextResponse.json({})

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      primaryColor: true,
      accentColor: true,
      domain: true,
      supportEmail: true,
      supportPhone: true,
    },
  })

  return NextResponse.json(org ?? {})
}

// PATCH — update org branding (ADMIN only)
export async function PATCH(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = (session.user as any).orgId
  if (!orgId) return NextResponse.json({ error: 'No organization linked' }, { status: 400 })

  const body = await req.json()
  const {
    name,
    logoUrl,
    primaryColor,
    accentColor,
    domain,
    supportEmail,
    supportPhone,
  } = body

  // Input validation
  const hexColorRe = /^#[0-9a-fA-F]{6}$/
  if (primaryColor && !hexColorRe.test(primaryColor)) {
    return NextResponse.json({ error: 'primaryColor must be a valid hex color (e.g. #1d4ed8)' }, { status: 400 })
  }
  if (accentColor && !hexColorRe.test(accentColor)) {
    return NextResponse.json({ error: 'accentColor must be a valid hex color (e.g. #7c3aed)' }, { status: 400 })
  }
  if (logoUrl && !/^https?:\/\/.+/.test(logoUrl)) {
    return NextResponse.json({ error: 'logoUrl must be a valid HTTP(S) URL' }, { status: 400 })
  }
  if (domain && !/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
    return NextResponse.json({ error: 'domain must be a valid domain name' }, { status: 400 })
  }
  if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
    return NextResponse.json({ error: 'supportEmail must be a valid email address' }, { status: 400 })
  }
  if (name && (typeof name !== 'string' || name.length > 200)) {
    return NextResponse.json({ error: 'name must be a string under 200 characters' }, { status: 400 })
  }

  const data: Record<string, any> = {}
  if (name !== undefined) data.name = name
  if (logoUrl !== undefined) data.logoUrl = logoUrl || null
  if (primaryColor !== undefined) data.primaryColor = primaryColor || null
  if (accentColor !== undefined) data.accentColor = accentColor || null
  if (domain !== undefined) data.domain = domain || null
  if (supportEmail !== undefined) data.supportEmail = supportEmail || null
  if (supportPhone !== undefined) data.supportPhone = supportPhone || null

  const updated = await prisma.organization.update({
    where: { id: orgId },
    data,
  })

  return NextResponse.json(updated)
}
