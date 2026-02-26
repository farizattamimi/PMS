import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
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
  const session = await getServerSession(authOptions)
  if (!session || session.user.systemRole === 'TENANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { enabled, autoExecuteTypes, tone } = body

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
