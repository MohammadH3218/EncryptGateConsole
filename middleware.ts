// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Get the path
  const path = request.nextUrl.pathname
  
  // Define public paths that don't require authentication
  const isPublicPath = 
    path === '/login' || 
    path === '/api/auth/login' || 
    path === '/api/auth/callback' || 
    path === '/api/auth/logout'
  
  // Check for authentication token
  const token = request.cookies.get('access_token')?.value
  
  // Redirect logic
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
     * - api/auth (API routes that handle authentication)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
}