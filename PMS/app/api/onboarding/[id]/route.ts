import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { computeProgress } from '@/lib/onboarding'

// GET — single checklist detail
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const checklist = await prisma.onboardingChecklist.findUnique({
    where: { id: params.id },
    include: {
      tasks: { orderBy: { sortOrder: 'asc' } },
      lease: {
        include: {
          tenant: { include: { user: { select: { name: true, id: true } } } },
          unit: { select: { unitNumber: true } },
          property: { select: { name: true, id: true, managerId: true } },
        },
      },
    },
  })

  if (!checklist) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only ADMIN, MANAGER, TENANT can view onboarding checklists
  if (!['ADMIN', 'MANAGER', 'TENANT'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Scope check
  if (session.user.systemRole === 'TENANT') {
    if (checklist.lease.tenant.user.id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else if (session.user.systemRole === 'MANAGER') {
    if (checklist.lease.property?.managerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const progress = computeProgress(checklist.tasks)
  return NextResponse.json({ ...checklist, progress })
}

// PATCH — update checklist status
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER', 'TENANT'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { status } = await req.json()
  if (!status || !['PENDING', 'IN_PROGRESS', 'COMPLETED'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // Verify ownership before updating
  const checklist = await prisma.onboardingChecklist.findUnique({
    where: { id: params.id },
    include: {
      lease: {
        include: {
          tenant: { include: { user: { select: { id: true } } } },
          property: { select: { managerId: true } },
        },
      },
    },
  })

  if (!checklist) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.user.systemRole === 'TENANT') {
    if (checklist.lease.tenant.user.id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else if (session.user.systemRole === 'MANAGER') {
    if (checklist.lease.property?.managerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const updated = await prisma.onboardingChecklist.update({
    where: { id: params.id },
    data: { status },
  })
  return NextResponse.json(updated)
}
