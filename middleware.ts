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
  
  // Redirect old /login to setup-organization
  if (pathname === '/login') {
    return NextResponse.redirect(new URL('/setup-organization', req.url))
  }
  
  if (isPublic(pathname)) return NextResponse.next()

  // Get orgId from multiple sources (consistent with API)
  const cookieOrg = req.cookies.get('orgId')?.value || req.cookies.get('org_id')?.value
  const urlParams = new URL(req.url).searchParams
  const urlOrg = urlParams.get('orgId')
  
  // Convenience: rewrite /admin/* to /o/{org}/admin/* if cookie present
  if (pathname.startsWith('/admin/') && cookieOrg) {
    const url = req.nextUrl.clone()
    url.pathname = `/o/${cookieOrg}${pathname}`
    return NextResponse.rewrite(url)
  }

  // Enforce auth + org for /o/{org}/...
  if (pathname.startsWith('/o/')) {
    const segs = pathname.split('/')
    const pathOrg = segs[2] || ''
    
    // Allow login pages without authentication
    if (pathname === `/o/${pathOrg}/login`) {
      return NextResponse.next()
    }
    
    const access = req.cookies.get('access_token')?.value
    const hasOrg = Boolean(cookieOrg || pathOrg || urlOrg)
    
    // Only redirect to setup if we have NO org context anywhere and not on setup route
    const isSetup = pathname.startsWith('/setup-organization')
    if (!hasOrg && !isSetup) {
      const setup = req.nextUrl.clone()
      setup.pathname = '/setup-organization'
      return NextResponse.redirect(setup)
    }

    if (!access) {
      const login = req.nextUrl.clone()
      login.pathname = `/o/${pathOrg}/login`
      login.searchParams.set('next', pathname + (search || ''))
      return NextResponse.redirect(login)
    }
    
    // Be more tolerant - only redirect if there's a clear mismatch
    if (cookieOrg && pathOrg && cookieOrg !== pathOrg) {
      // force the browser to pick up the right org
      const login = req.nextUrl.clone()
      login.pathname = `/o/${pathOrg}/login`
      login.searchParams.set('next', pathname + (search || ''))
      return NextResponse.redirect(login)
    }
    return NextResponse.next()
  }

  // Block anything else by default - but redirect to setup if no org context
  const hasAnyOrg = Boolean(cookieOrg || urlOrg)
  if (!hasAnyOrg && !pathname.startsWith('/setup-organization')) {
    return NextResponse.redirect(new URL('/setup-organization', req.url))
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}