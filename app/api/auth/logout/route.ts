// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(_req: NextRequest) {
  try {
    const domain = process.env.COGNITO_DOMAIN
    const clientId = process.env.COGNITO_CLIENT_ID
    const logoutUri = process.env.COGNITO_LOGOUT_URI

    // Validate environment variables
    if (!domain || !clientId || !logoutUri) {
      console.error('❌ Missing required environment variables')
      return new NextResponse('Server configuration error', { status: 500 })
    }

    const encodedLogoutUri = encodeURIComponent(logoutUri)
    console.log('🔄 Encoded logout URI:', encodedLogoutUri)

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