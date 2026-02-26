import 'next-auth'
import { SystemRole } from '@prisma/client'

declare module 'next-auth' {
  interface User {
    systemRole: SystemRole
    id: string
  }

  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      systemRole: SystemRole
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    systemRole: SystemRole
    id: string
  }
}
