import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { publishAgentEvent } from '@/lib/agent-events'

// SLA hours by severity
const SLA_HOURS: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 24,
  MEDIUM: 72,
  LOW: 168, // 7 days
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')
  const status = searchParams.get('status')
  const severity = searchParams.get('severity')

  const where: any = {}

  if (session.user.systemRole === 'MANAGER') {
    // Managers see incidents for their properties
    where.property = { managerId: session.user.id }
  } else if (session.user.systemRole === 'TENANT') {
    // Tenants see incidents they reported
    where.reportedBy = session.user.id
  }

  if (propertyId) where.propertyId = propertyId
  if (status) where.status = status
  if (severity) where.severity = severity

  const incidents = await prisma.incident.findMany({
    where,
    include: {
      property: { select: { id: true, name: true } },
    },
    orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json(incidents)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { propertyId, category, title, description, severity = 'MEDIUM' } = body

  if (!propertyId || !category || !title || !description) {
    return NextResponse.json({ error: 'propertyId, category, title, and description are required' }, { status: 400 })
  }

  const slaHours = SLA_HOURS[severity] ?? 72
  const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000)

  const incident = await prisma.incident.create({
    data: {
      propertyId,
      reportedBy: session.user.id,
      category,
      title,
      description,
      severity,
      slaDeadline,
    },
    include: {
      property: { select: { id: true, name: true } },
    },
  })

  await writeAudit({
    actorUserId: session.user.id,
    action: 'CREATE',
    entityType: 'Incident',
    entityId: incident.id,
    diff: { propertyId, category, severity, title },
  })

  // Notify autonomous agent of new incident (fire-and-forget)
  publishAgentEvent({
    eventType: 'NEW_INCIDENT',
    propertyId,
    entityId: incident.id,
    entityType: 'incident',
    payload: { severity, category },
  })

  return NextResponse.json(incident, { status: 201 })
}
