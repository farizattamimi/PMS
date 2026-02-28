'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { formatDate } from '@/lib/utils'
import { CheckCircle, Circle, FileUp, PenTool, CreditCard, ClipboardCheck, Info, Star } from 'lucide-react'

const TASK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  DOCUMENT_UPLOAD: FileUp,
  SIGNATURE: PenTool,
  PAYMENT: CreditCard,
  INSPECTION: ClipboardCheck,
  INFO: Info,
  CUSTOM: Star,
}

export default function MyOnboardingPage() {
  const [checklists, setChecklists] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/onboarding')
    const data = await res.json()
    setChecklists(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleComplete(checklistId: string, taskId: string) {
    setCompleting(taskId)
    await fetch(`/api/onboarding/${checklistId}/tasks/${taskId}/complete`, { method: 'POST' })
    setCompleting(null)
    load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (checklists.length === 0) {
    return (
      <div>
        <PageHeader title="My Onboarding" subtitle="Move-in checklist" />
        <Card className="text-center py-12">
          <ClipboardCheck className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No onboarding checklist found.</p>
          <p className="text-sm text-gray-400 mt-1">A checklist will appear here when your lease is created.</p>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="My Onboarding" subtitle="Complete your move-in checklist" />

      {checklists.map(checklist => {
        const tasks = checklist.tasks ?? []
        const totalTasks = tasks.length
        const completedTasks = tasks.filter((t: any) => t.completedAt).length
        const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
        const allRequiredDone = tasks.filter((t: any) => t.isRequired).every((t: any) => t.completedAt)
        const propertyName = checklist.lease?.property?.name ?? ''
        const unitNumber = checklist.lease?.unit?.unitNumber ?? ''

        return (
          <div key={checklist.id} className="mb-8">
            {/* Property label */}
            {propertyName && (
              <p className="text-sm text-gray-500 mb-2">{propertyName}{unitNumber ? ` — Unit ${unitNumber}` : ''}</p>
            )}

            {/* Progress bar */}
            <Card className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">{completedTasks} of {totalTasks} tasks completed</span>
                <span className="text-sm font-bold text-gray-900">{pct}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="h-3 rounded-full bg-green-500 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </Card>

            {/* Congratulations banner */}
            {allRequiredDone && (
              <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-800 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm">All required tasks completed!</p>
                  <p className="text-xs text-green-600">You&apos;re all set. Welcome to your new home!</p>
                </div>
              </div>
            )}

            {/* Task cards */}
            <div className="space-y-3">
              {tasks.map((task: any) => {
                const Icon = TASK_ICONS[task.taskType] ?? Star
                const done = !!task.completedAt
                return (
                  <Card key={task.id} className={`flex items-start gap-4 ${done ? 'bg-gray-50' : ''}`}>
                    <div className={`mt-0.5 flex-shrink-0 rounded-full p-2 ${done ? 'bg-green-100' : 'bg-blue-50'}`}>
                      <Icon className={`h-5 w-5 ${done ? 'text-green-600' : 'text-blue-600'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className={`text-sm font-semibold ${done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{task.title}</h3>
                        {task.isRequired && !done && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-red-50 text-red-600 rounded">Required</span>
                        )}
                      </div>
                      {task.description && <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>}
                      {done && <p className="text-xs text-green-600 mt-1">Completed {formatDate(task.completedAt)}</p>}
                    </div>
                    <div className="flex-shrink-0">
                      {done ? (
                        <CheckCircle className="h-6 w-6 text-green-500" />
                      ) : (
                        <button
                          onClick={() => handleComplete(checklist.id, task.id)}
                          disabled={completing === task.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {completing === task.id ? (
                            'Saving…'
                          ) : (
                            <>
                              <Circle className="h-3.5 w-3.5" />
                              Mark Complete
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
