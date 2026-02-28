import { NextResponse } from 'next/server'
import { sessionProvider } from '@/lib/session-provider'
import { prisma } from '@/lib/prisma'
import { computeProgress } from '@/lib/onboarding'

// POST — mark a task as complete
export async function POST(_req: Request, { params }: { params: { id: string; taskId: string } }) {
  const session = await sessionProvider.getSession()
  if (!session || !['ADMIN', 'MANAGER', 'TENANT'].includes(session.user.systemRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const task = await prisma.onboardingTask.findUnique({
    where: { id: params.taskId },
    include: {
      checklist: {
        include: {
          lease: {
            include: {
              tenant: { include: { user: { select: { id: true } } } },
              property: { select: { managerId: true } },
            },
          },
          tasks: true,
        },
      },
    },
  })

  if (!task || task.checklistId !== params.id) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  // Scope check: tenant owns checklist, manager manages property
  if (session.user.systemRole === 'TENANT') {
    if (task.checklist.lease.tenant.user.id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else if (session.user.systemRole === 'MANAGER') {
    if (task.checklist.lease.property?.managerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  if (task.completedAt) {
    return NextResponse.json({ error: 'Task already completed' }, { status: 400 })
  }

  const updated = await prisma.onboardingTask.update({
    where: { id: params.taskId },
    data: { completedAt: new Date(), completedById: session.user.id },
  })

  // Check if all tasks done, auto-update checklist status
  const allTasks = await prisma.onboardingTask.findMany({
    where: { checklistId: params.id },
  })
  const progress = computeProgress(allTasks)

  if (progress.allRequiredDone) {
    await prisma.onboardingChecklist.update({
      where: { id: params.id },
      data: { status: 'COMPLETED' },
    })
  } else if (progress.completed > 0) {
    await prisma.onboardingChecklist.update({
      where: { id: params.id },
      data: { status: 'IN_PROGRESS' },
    })
  }

  return NextResponse.json({ ...updated, progress })
}
