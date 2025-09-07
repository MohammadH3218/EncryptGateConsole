// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = new Set([
  '/', '/login', '/setup-organization', '/api/auth/login', '/api/auth/logout',
  '/api/auth/callback', '/api/setup/create-organization',
])

function isPublic(path: string) {
  if (path.startsWith('/api/')) return true
  if (path.startsWith('/_next/')) return true
  if (path === '/favicon.ico') return true
  if (PUBLIC_PATHS.has(path)) return true
  return false
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  // Require auth for everything else (e.g., /admin/**)
  const access = req.cookies.get('access_token')?.value
  if (!access) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}