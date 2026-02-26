import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')
  const status = searchParams.get('status')
  const search = searchParams.get('search')

  // Tenants can only see their own applications (matched by email)
  if (session.user.systemRole === 'TENANT') {
    const where: any = { email: session.user.email }
    if (status) where.status = status
    const applications = await prisma.tenantApplication.findMany({
      where,
      include: {
        property: { select: { id: true, name: true } },
        unit: { select: { id: true, unitNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(applications)
  }

  const propertyFilter =
    session.user.systemRole === 'MANAGER' ? { managerId: session.user.id } : {}

  const where: any = { property: propertyFilter }
  if (propertyId) where.propertyId = propertyId
  if (status) where.status = status
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
    ]
  }

  const applications = await prisma.tenantApplication.findMany({
    where,
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true } },
      tenant: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(applications)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole !== 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const {
    propertyId,
    unitId,
    firstName,
    lastName,
    email,
    phone,
    desiredMoveIn,
    desiredTerm,
    monthlyIncome,
    currentAddress,
    employer,
    notes,
  } = body

  if (!propertyId || !firstName || !lastName || !email || !desiredMoveIn || !desiredTerm) {
    return NextResponse.json(
      { error: 'propertyId, firstName, lastName, email, desiredMoveIn, desiredTerm required' },
      { status: 400 }
    )
  }

  // Tenants cannot spoof their email — lock it to their account
  const resolvedEmail = session.user.systemRole === 'TENANT' ? session.user.email : email

  const application = await prisma.tenantApplication.create({
    data: {
      propertyId,
      unitId: unitId || null,
      firstName,
      lastName,
      email: resolvedEmail,
      phone: phone || null,
      desiredMoveIn: new Date(desiredMoveIn),
      desiredTerm: Number(desiredTerm),
      monthlyIncome: monthlyIncome ? Number(monthlyIncome) : null,
      currentAddress: currentAddress || null,
      employer: employer || null,
      notes: notes || null,
    },
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true } },
    },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'TenantApplication',
    entityId: application.id,
    diff: { propertyId, firstName, lastName, email, desiredMoveIn, desiredTerm },
  })

  return NextResponse.json(application, { status: 201 })
}
