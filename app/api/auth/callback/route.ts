// app/api/auth/callback/route.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { Buffer } from 'buffer'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    console.log('↪️  Entering callback')

    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    console.log('🔑 code=', code)

    // Get environment variables with validation
    const domain = process.env.COGNITO_DOMAIN
    const clientId = process.env.COGNITO_CLIENT_ID
    const clientSecret = process.env.COGNITO_CLIENT_SECRET
    const redirectUri = process.env.COGNITO_REDIRECT_URI
    
    // Set absolute base URL for redirects
    const baseUrl = 'https://console-encryptgate.net'
    
    console.log('🔧 Using COGNITO_DOMAIN=', domain)
    console.log('🔧 Using COGNITO_CLIENT_ID=', clientId)
    console.log('🔧 Client secret present?', !!clientSecret)
    console.log('🌐 COGNITO_REDIRECT_URI=', redirectUri)
    console.log('📍 Base URL=', baseUrl)

    if (!domain || !clientId || !redirectUri) {
      console.error('❌ Missing required environment variables')
      return new NextResponse('Server configuration error', { status: 500 })
    }

    if (!code) {
      console.warn('⚠️  No code; redirecting to login')
      return NextResponse.redirect(`${baseUrl}/api/auth/login`)
    }

    // Exchange code for tokens
    const tokenUrl = `https://${domain}/oauth2/token`
    console.log('🚀 Fetching tokens from', tokenUrl)

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(clientSecret && {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        }),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code,
      }),
    })

    console.log('🎫 tokenRes.status=', tokenRes.status)

    if (!tokenRes.ok) {
      const text = await tokenRes.text()
      console.error('❌ Token exchange failed:', text)
      return NextResponse.redirect(`${baseUrl}/api/auth/login`)
    }

    const { id_token, access_token, refresh_token } = await tokenRes.json()
    console.log('✅ Received tokens; setting cookies')

    const res = NextResponse.redirect(`${baseUrl}/admin/dashboard`)
    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    }

    res.cookies.set('id_token', id_token, cookieOpts)
    res.cookies.set('access_token', access_token, cookieOpts)
    if (refresh_token) {
      res.cookies.set('refresh_token', refresh_token, {
        ...cookieOpts,
        maxAge: 30 * 24 * 60 * 60,
      })
    }

    console.log('🚩 Redirecting to /admin/dashboard')
    return res

  } catch (err: any) {
    console.error('💥 Unhandled error in callback:', err)
    // Use a hardcoded URL to avoid any URL construction errors
    return NextResponse.redirect('https://console-encryptgate.net/api/auth/login')
  }
}