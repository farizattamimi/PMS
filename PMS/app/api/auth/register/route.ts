import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json()

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: { name, email, passwordHash, systemRole: 'TENANT' },
      select: { id: true, name: true, email: true, systemRole: true },
    })

    return NextResponse.json(user, { status: 201 })
  } catch (error) {
    console.error('[register]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
