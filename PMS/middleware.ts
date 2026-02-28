import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

function withSecurityHeaders(res: NextResponse): NextResponse {
  const scriptSrc =
    process.env.NODE_ENV === 'production'
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.headers.set(
    'Content-Security-Policy',
    `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  )
  return res
}

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
        '/dashboard/my-maintenance',
        '/dashboard/my-onboarding',
        '/dashboard/notification-preferences',
        '/dashboard/settings',
      ]
      const isAllowed = allowedPaths.some(p => pathname === p || pathname.startsWith(p + '/'))
      if (!isAllowed && pathname.startsWith('/dashboard')) {
        return withSecurityHeaders(NextResponse.redirect(new URL('/dashboard', req.url)))
      }
    }

    // Owner can only access owner portal routes
    if (token?.systemRole === 'OWNER') {
      const allowedPaths = [
        '/dashboard',
        '/dashboard/owner-portal',
        '/dashboard/notification-preferences',
        '/dashboard/settings',
      ]
      const isAllowed = allowedPaths.some(p => pathname === p || pathname.startsWith(p + '/'))
      if (!isAllowed && pathname.startsWith('/dashboard')) {
        return withSecurityHeaders(NextResponse.redirect(new URL('/dashboard/owner-portal', req.url)))
      }
    }

    // Vendor can only access vendor portal routes
    if (token?.systemRole === 'VENDOR') {
      const allowedPaths = [
        '/dashboard',
        '/dashboard/vendor-portal',
        '/dashboard/notification-preferences',
        '/dashboard/settings',
      ]
      const isAllowed = allowedPaths.some(p => pathname === p || pathname.startsWith(p + '/'))
      if (!isAllowed && pathname.startsWith('/dashboard')) {
        return withSecurityHeaders(NextResponse.redirect(new URL('/dashboard/vendor-portal', req.url)))
      }
    }

    return withSecurityHeaders(NextResponse.next())
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
