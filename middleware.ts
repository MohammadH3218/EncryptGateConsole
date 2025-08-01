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
    path.startsWith('/_next/') ||
    path === '/favicon.ico'
  
  // Check for authentication token
  const token = request.cookies.get('access_token')?.value
  
  // Redirect logic - only apply to non-API, non-public paths
  if (!isPublicPath && !token) {
    // If user is on a protected path but has no token, redirect to login
    return NextResponse.redirect(new URL('/login', request.url))
  }
  
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