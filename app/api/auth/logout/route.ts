// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const domain = process.env.COGNITO_DOMAIN
    const clientId = process.env.COGNITO_CLIENT_ID
    const baseLogoutUri = process.env.COGNITO_LOGOUT_URI

    // Validate environment variables
    if (!domain || !clientId || !baseLogoutUri) {
      console.error('❌ Missing required environment variables')
      return new NextResponse('Server configuration error', { status: 500 })
    }

    // Get orgId from query params, referer, or fallback to base URI
    const url = new URL(req.url)
    let orgId = url.searchParams.get('orgId')
    
    // Try to extract orgId from referer if not in query params
    if (!orgId && req.headers.get('referer')) {
      const referer = req.headers.get('referer') || ''
      const orgMatch = referer.match(/\/o\/([^\/]+)/)
      if (orgMatch) {
        orgId = orgMatch[1]
      }
    }

    // Build logout URI - org-specific or fallback to base
    let logoutUri = baseLogoutUri
    if (orgId) {
      // Construct org-specific logout URI
      const baseUrl = baseLogoutUri.replace(/\/[^\/]*$/, '') // Remove the last path segment
      logoutUri = `${baseUrl}/logout?orgId=${orgId}`
      console.log(`🏢 Using org-specific logout URI for ${orgId}:`, logoutUri)
    } else {
      console.log('🔄 Using base logout URI:', logoutUri)
    }

    const encodedLogoutUri = encodeURIComponent(logoutUri)
    const logoutUrl = `https://${domain}/logout?client_id=${clientId}&logout_uri=${encodedLogoutUri}`
    console.log('🔀 Redirecting to Cognito logout:', logoutUrl)

    const res = NextResponse.redirect(logoutUrl)
    for (const name of ['access_token', 'id_token', 'refresh_token']) {
      res.cookies.set(name, '', { maxAge: 0, path: '/' })
    }
    return res
  } catch (err: any) {
    console.error('💥 Unhandled error in logout:', err)
    return new NextResponse('Server error', { status: 500 })
  }
}