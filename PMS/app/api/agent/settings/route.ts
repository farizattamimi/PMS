import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sessionProvider } from '@/lib/session-provider'

const ALLOWED_AUTO_EXECUTE_TYPES = new Set([
  'SEND_MESSAGE',
  'ASSIGN_VENDOR',
  'SEND_BID_REQUEST',
  'ACCEPT_BID',
  'SEND_RENEWAL_OFFER',
  'CREATE_WORK_ORDER',
  'CLOSE_THREAD',
])

const ALLOWED_TONES = new Set(['professional', 'friendly', 'concise'])

export async function GET() {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole !== 'MANAGER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const settings = await prisma.agentSettings.upsert({
    where: { managerId: session.user.id },
    update: {},
    create: {
      managerId: session.user.id,
      enabled: false,
      autoExecuteTypes: [],
      tone: 'professional',
    },
  })

  return NextResponse.json(settings)
}

export async function PATCH(req: Request) {
  const session = await sessionProvider.getSession()
  if (!session || session.user.systemRole !== 'MANAGER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { enabled, autoExecuteTypes, tone } = body
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 })
  }
  if (autoExecuteTypes !== undefined) {
    if (!Array.isArray(autoExecuteTypes)) {
      return NextResponse.json({ error: 'autoExecuteTypes must be an array of strings' }, { status: 400 })
    }
    for (const t of autoExecuteTypes) {
      if (typeof t !== 'string' || !ALLOWED_AUTO_EXECUTE_TYPES.has(t)) {
        return NextResponse.json({ error: `Unsupported autoExecuteType: ${String(t)}` }, { status: 400 })
      }
    }
  }
  if (tone !== undefined && (typeof tone !== 'string' || !ALLOWED_TONES.has(tone))) {
    return NextResponse.json({ error: `Unsupported tone: ${String(tone)}` }, { status: 400 })
  }

  const settings = await prisma.agentSettings.upsert({
    where: { managerId: session.user.id },
    update: {
      ...(enabled !== undefined && { enabled }),
      ...(autoExecuteTypes !== undefined && { autoExecuteTypes }),
      ...(tone !== undefined && { tone }),
    },
    create: {
      managerId: session.user.id,
      enabled: enabled ?? false,
      autoExecuteTypes: autoExecuteTypes ?? [],
      tone: tone ?? 'professional',
    },
  })

  return NextResponse.json(settings)
}
