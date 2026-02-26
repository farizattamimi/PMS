import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const pathname = req.nextUrl.pathname

    // Tenant can only access specific routes
    if (token?.systemRole === 'TENANT') {
      const allowedPaths = [
        '/dashboard',
        '/dashboard/workorders',
        '/dashboard/my-lease',
        '/dashboard/my-payments',
        '/dashboard/incidents',
        '/dashboard/messages',
        '/dashboard/applications',
      ]
      const isAllowed = allowedPaths.some(p => pathname === p || pathname.startsWith(p + '/'))
      if (!isAllowed && pathname.startsWith('/dashboard')) {
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
)

export const config = {
  matcher: ['/dashboard/:path*'],
}
