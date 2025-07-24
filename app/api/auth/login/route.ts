// app/api/auth/login/route.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(_req: NextRequest) {
  try {
    const domain = process.env.COGNITO_DOMAIN
    const clientId = process.env.COGNITO_CLIENT_ID
    const redirectUri = process.env.COGNITO_REDIRECT_URI

    // Validate environment variables
    if (!domain || !clientId || !redirectUri) {
      console.error('❌ Missing required environment variables:', { domain, clientId, redirectUri })
      return new NextResponse('Server configuration error', { status: 500 })
    }

    const encodedRedirectUri = encodeURIComponent(redirectUri)
    console.log('🔄 Encoded redirect URI:', encodedRedirectUri)

    const loginUrl =
      `https://${domain}/login?` +
      `client_id=${clientId}` +
      `&response_type=code` +
      `&scope=email+openid+phone` +
      `&redirect_uri=${encodedRedirectUri}`

    console.log('🔀 Redirecting to Cognito login:', loginUrl)
    return NextResponse.redirect(loginUrl)
  } catch (err: any) {
    console.error('💥 Unhandled error in login:', err)
    return new NextResponse('Server error', { status: 500 })
  }
}