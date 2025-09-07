// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Get the path
  const path = request.nextUrl.pathname
  
  // Allow ALL API routes to pass through without authentication
  // This includes webhooks, email processing, and other API endpoints
  if (path.startsWith('/api/')) {
    return NextResponse.next()
  }
  
  // Define public paths that don't require authentication
  const isPublicPath = 
    path === '/login' || 
    path === '/' ||
    path === '/logout' ||
    path === '/setup' ||
    path === '/setup-organization' ||
    path.startsWith('/auth/') ||
    path.startsWith('/_next/') ||
    path === '/favicon.ico'
  
  // Since tokens are stored in localStorage (client-side), we can't check them in middleware
  // Instead, we'll let protected routes handle their own authentication checks
  // The middleware will only redirect users from login if they're already authenticated
  
  // For now, just allow all paths and let individual pages handle auth
  // The login page will redirect to dashboard if user is already logged in
  // Protected pages will redirect to login if user is not authenticated
  
  return NextResponse.next()
}

// Only run middleware on these paths
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * 
     * Note: We handle API route exclusion in the middleware function itself
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}