import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { SystemRole } from '@prisma/client'

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Invalid credentials')
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user || !user.passwordHash) {
          throw new Error('No user found with this email')
        }

        if (!user.isActive) {
          throw new Error('This account has been deactivated')
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        )

        if (!isPasswordValid) {
          throw new Error('Invalid password')
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          systemRole: user.systemRole,
          orgId: user.orgId,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.systemRole = (user as any).systemRole
        token.id = user.id
        token.orgId = (user as any).orgId ?? null
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.systemRole = token.systemRole as SystemRole
        session.user.id = token.id as string
        session.user.orgId = (token.orgId as string) ?? null
      }
      return session
    },
  },
}
