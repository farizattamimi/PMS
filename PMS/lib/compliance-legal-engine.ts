import { createException, completeRun, failRun, startRun } from '@/lib/agent-runtime'
import { prisma } from '@/lib/prisma'

type LegalRunInput = {
  runId: string
  propertyId: string
  payload: Record<string, unknown>
}

const TEMPLATES: Record<string, string> = {
  CA: 'California Notice Template: {{reason}}. Cure by {{deadline}}.',
  NY: 'New York Notice Template: {{reason}}. Cure by {{deadline}}.',
  TX: 'Texas Notice Template: {{reason}}. Cure by {{deadline}}.',
  DEFAULT: 'General Notice Template: {{reason}}. Cure by {{deadline}}.',
}

function chooseTemplate(jurisdiction: string | null | undefined): string {
  if (!jurisdiction) return TEMPLATES.DEFAULT
  return TEMPLATES[jurisdiction.toUpperCase()] ?? TEMPLATES.DEFAULT
}

export async function runComplianceLegalAutopilot(input: LegalRunInput) {
  const { runId, propertyId, payload } = input
  try {
    await startRun(runId)
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, state: true, name: true },
    })
    if (!property) throw new Error('Property not found')

    const reason = typeof payload.reason === 'string' && payload.reason.trim().length > 0
      ? payload.reason
      : 'Lease or compliance breach'
    const deadline = new Date(Date.now() + 7 * 86400000)
    const template = chooseTemplate(property.state)
    const noticeBody = template
      .replace('{{reason}}', reason)
      .replace('{{deadline}}', deadline.toISOString().slice(0, 10))

    const docs = await prisma.document.findMany({
      where: { propertyId, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
      select: { id: true, fileName: true, createdAt: true, scopeType: true, scopeId: true },
      take: 50,
      orderBy: { createdAt: 'desc' },
    })
    const incidents = await prisma.incident.findMany({
      where: { propertyId, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
      select: { id: true, title: true, severity: true, createdAt: true },
      take: 50,
      orderBy: { createdAt: 'desc' },
    })

    await createException({
      runId,
      propertyId,
      severity: 'MEDIUM',
      category: 'LEGAL',
      title: `Legal notice draft ready (${property.state ?? 'DEFAULT'})`,
      details: `Drafted legal notice for ${property.name}; review before sending.`,
      contextJson: {
        noticeBody,
        jurisdiction: property.state ?? 'DEFAULT',
        deadline: deadline.toISOString(),
        evidenceBundle: { documents: docs, incidents },
      },
      requiresBy: deadline,
    })

    await completeRun(runId, `Compliance legal engine prepared notice and evidence bundle for ${property.name}`)
  } catch (err: any) {
    await failRun(runId, err?.message ?? 'Compliance legal engine failed')
  }
}
