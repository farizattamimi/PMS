import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { createOnboardingChecklist } from '@/lib/onboarding'

// GET — list onboarding checklists (tenant: own, manager: managed properties)
export async function GET() {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (session.user.systemRole === 'TENANT') {
    const tenant = await prisma.tenant.findUnique({ where: { userId: session.user.id }, select: { id: true } })
    if (!tenant) return NextResponse.json([])

    const checklists = await prisma.onboardingChecklist.findMany({
      where: { lease: { tenantId: tenant.id } },
      include: {
        tasks: { orderBy: { sortOrder: 'asc' } },
        lease: { include: { unit: { select: { unitNumber: true } }, property: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(checklists)
  }

  if (!['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const where = session.user.systemRole === 'MANAGER'
    ? { lease: { property: { managerId: session.user.id } } }
    : {}

  const checklists = await prisma.onboardingChecklist.findMany({
    where,
    include: {
      tasks: { orderBy: { sortOrder: 'asc' } },
      lease: { include: { tenant: { include: { user: { select: { name: true } } } }, unit: { select: { unitNumber: true } }, property: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(checklists)
}

// POST — create a checklist for a lease
export async function POST(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { leaseId } = await req.json()
  if (!leaseId) return NextResponse.json({ error: 'leaseId required' }, { status: 400 })

  // Verify lease exists and manager has access to the property
  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: { property: { select: { managerId: true } } },
  })
  if (!lease) return NextResponse.json({ error: 'Lease not found' }, { status: 404 })

  if (session.user.systemRole === 'MANAGER' && lease.property?.managerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const existing = await prisma.onboardingChecklist.findUnique({ where: { leaseId } })
  if (existing) return NextResponse.json({ error: 'Checklist already exists for this lease' }, { status: 400 })

  const checklist = await createOnboardingChecklist(leaseId)
  return NextResponse.json(checklist, { status: 201 })
}
