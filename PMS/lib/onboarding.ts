import { prisma } from './prisma'
import { OnboardingTaskType } from '@prisma/client'

interface DefaultTask {
  title: string
  description: string
  taskType: OnboardingTaskType
  isRequired: boolean
}

export const DEFAULT_TASKS: DefaultTask[] = [
  {
    title: "Upload renter's insurance",
    description: 'Upload proof of renter\'s insurance meeting the minimum coverage requirements.',
    taskType: 'DOCUMENT_UPLOAD',
    isRequired: true,
  },
  {
    title: 'Sign lease agreement',
    description: 'Review and sign your lease agreement electronically.',
    taskType: 'SIGNATURE',
    isRequired: true,
  },
  {
    title: 'Pay security deposit',
    description: 'Submit your security deposit payment through the tenant portal.',
    taskType: 'PAYMENT',
    isRequired: true,
  },
  {
    title: 'Schedule move-in inspection',
    description: 'Schedule a move-in inspection with your property manager.',
    taskType: 'INSPECTION',
    isRequired: true,
  },
  {
    title: 'Set up payment method',
    description: 'Add your preferred payment method for monthly rent payments.',
    taskType: 'PAYMENT',
    isRequired: true,
  },
  {
    title: 'Provide emergency contact info',
    description: 'Add your emergency contact name and phone number to your profile.',
    taskType: 'INFO',
    isRequired: true,
  },
  {
    title: 'Review community guidelines',
    description: 'Read and acknowledge the community rules and guidelines for your property.',
    taskType: 'INFO',
    isRequired: false,
  },
]

export async function createOnboardingChecklist(leaseId: string) {
  const checklist = await prisma.onboardingChecklist.create({
    data: {
      leaseId,
      status: 'PENDING',
      tasks: {
        create: DEFAULT_TASKS.map((task, index) => ({
          title: task.title,
          description: task.description,
          taskType: task.taskType,
          isRequired: task.isRequired,
          sortOrder: index + 1,
        })),
      },
    },
    include: { tasks: true },
  })
  return checklist
}

export function computeProgress(tasks: { completedAt: Date | null; isRequired: boolean }[]) {
  const total = tasks.length
  const completed = tasks.filter(t => t.completedAt !== null).length
  const requiredTotal = tasks.filter(t => t.isRequired).length
  const requiredCompleted = tasks.filter(t => t.isRequired && t.completedAt !== null).length
  const allRequiredDone = requiredCompleted === requiredTotal
  return { total, completed, requiredTotal, requiredCompleted, allRequiredDone, pct: total > 0 ? Math.round((completed / total) * 100) : 0 }
}
