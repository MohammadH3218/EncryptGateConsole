// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC = new Set([
  '/', '/setup-organization',
  '/login',                 // optional legacy
])

// Treat only these API namespaces as public:
const PUBLIC_API_PREFIXES = [
  '/api/auth/',             // login/callback/logout/mfa/etc.
  '/api/setup/',            // org creation & validation
  '/_next/', '/favicon.ico',
]

function isPublic(path: string) {
  if (PUBLIC.has(path)) return true
  if (PUBLIC_API_PREFIXES.some(p => path.startsWith(p))) return true
  return false
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  
  console.log('🔍 MIDDLEWARE: Request to:', pathname)
  
  // Redirect old /login to setup-organization
  if (pathname === '/login') {
    console.log('🔄 MIDDLEWARE: Redirecting /login → /setup-organization')
    return NextResponse.redirect(new URL('/setup-organization', req.url))
  }
  
  if (isPublic(pathname)) return NextResponse.next()

  // Convenience: rewrite /admin/* to /o/{org}/admin/* if cookie present
  const orgCookie = req.cookies.get('org_id')?.value
  if (pathname.startsWith('/admin/') && orgCookie) {
    const url = req.nextUrl.clone()
    url.pathname = `/o/${orgCookie}${pathname}`
    return NextResponse.rewrite(url)
  }

  // Enforce auth + org for /o/{org}/...
  if (pathname.startsWith('/o/')) {
    const segs = pathname.split('/')
    const pathOrg = segs[2] || ''
    
    // Allow login pages without authentication and set org hint cookie
    if (pathname === `/o/${pathOrg}/login`) {
      const response = NextResponse.next()
      // Set a hint cookie so API calls can resolve orgId even before login
      response.cookies.set('orgId_hint', pathOrg, {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
        secure: true,
      })
      return response
    }
    
    const access = req.cookies.get('access_token')?.value
    const cookieOrg = orgCookie

    if (!access) {
      const login = req.nextUrl.clone()
      login.pathname = `/o/${pathOrg}/login`
      login.searchParams.set('next', pathname + (search || ''))
      return NextResponse.redirect(login)
    }
    if (!cookieOrg || cookieOrg !== pathOrg) {
      // force the browser to pick up the right org
      const login = req.nextUrl.clone()
      login.pathname = `/o/${pathOrg}/login`
      login.searchParams.set('next', pathname + (search || ''))
      return NextResponse.redirect(login)
    }
    return NextResponse.next()
  }

  // Block anything else by default
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}