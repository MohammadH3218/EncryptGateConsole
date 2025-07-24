// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// List of paths that don't require authentication
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/callback', '/api/auth/logout']

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  
  // Check if current path is public
  const isPublicPath = PUBLIC_PATHS.some(publicPath => 
    path === publicPath || path.startsWith(publicPath + '/')
  )
  
  // Check for authentication token
  const token = request.cookies.get('access_token')?.value
  
  // If not a public path and no token, redirect to login
  if (!isPublicPath && !token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  
  return NextResponse.next()
}

// Improved matcher to ensure middleware runs on ALL app routes
export const config = {
  matcher: [
    // Include all routes except static files, images, api/auth, etc.
    '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
    // Include the root path
    '/'
  ]
}