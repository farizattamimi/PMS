import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import bcrypt from 'bcryptjs'

/**
 * POST /api/vendors/[id]/invite
 *
 * Creates a User account with systemRole=VENDOR and links it to the vendor.
 * If the vendor already has a portal account, returns 409.
 *
 * Body: { email: string, name: string, password: string }
 * Auth:  ADMIN or MANAGER only
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const vendor = await prisma.vendor.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, email: true, userId: true },
  })
  if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })

  // MANAGER can only invite vendors that serve their properties
  if (session.user.systemRole === 'MANAGER') {
    const linked = await prisma.propertyVendor.findFirst({
      where: { vendorId: params.id, property: { managerId: session.user.id } },
    })
    if (!linked) {
      return NextResponse.json({ error: 'Forbidden — vendor not associated with your properties' }, { status: 403 })
    }
  }
  if (vendor.userId) {
    return NextResponse.json({ error: 'Vendor already has a portal account' }, { status: 409 })
  }

  const body = await req.json()
  const { email, name, password } = body as { email: string; name: string; password: string }

  if (!email || !name || !password) {
    return NextResponse.json({ error: 'email, name, and password are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  // Check for existing user with that email
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 10)

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      systemRole: 'VENDOR',
    },
  })

  // Link vendor → user
  await prisma.vendor.update({
    where: { id: params.id },
    data:  { userId: user.id },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'VendorInvite',
    entityId: vendor.id,
    diff: { vendorId: vendor.id, userId: user.id, email },
  })

  return NextResponse.json({ userId: user.id, email: user.email }, { status: 201 })
}

/**
 * DELETE /api/vendors/[id]/invite
 *
 * Removes the portal access (unlinks user but does NOT delete the User record).
 */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // MANAGER can only revoke vendors that serve their properties
  if (session.user.systemRole === 'MANAGER') {
    const linked = await prisma.propertyVendor.findFirst({
      where: { vendorId: params.id, property: { managerId: session.user.id } },
    })
    if (!linked) {
      return NextResponse.json({ error: 'Forbidden — vendor not associated with your properties' }, { status: 403 })
    }
  }

  await prisma.vendor.update({
    where: { id: params.id },
    data:  { userId: null },
  })

  return NextResponse.json({ ok: true })
}
