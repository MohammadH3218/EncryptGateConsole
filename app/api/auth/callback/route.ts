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

    // Derive our frontend origin from REDIRECT_URI
    const redirectUri = process.env.COGNITO_REDIRECT_URI
    console.log('🌐 COGNITO_REDIRECT_URI=', redirectUri)

    if (!code) {
      console.warn('⚠️  No code; redirecting to login')
      return NextResponse.redirect(`${new URL(redirectUri!).origin}/api/auth/login`)
    }

    const domain       = process.env.COGNITO_DOMAIN
    const clientId     = process.env.COGNITO_CLIENT_ID
    const clientSecret = process.env.COGNITO_CLIENT_SECRET

    console.log('🔧 Using COGNITO_DOMAIN=', domain)
    console.log('🔧 Using COGNITO_CLIENT_ID=', clientId)
    console.log('🔧 Client secret present?', !!clientSecret)

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
        grant_type:   'authorization_code',
        client_id:    clientId!,
        redirect_uri: redirectUri!,
        code,
      }),
    })

    console.log('🎫 tokenRes.status=', tokenRes.status)

    if (!tokenRes.ok) {
      const text = await tokenRes.text()
      console.error('❌ Token exchange failed:', text)
      return NextResponse.redirect(`${new URL(redirectUri!).origin}/api/auth/login`)
    }

    const { id_token, access_token, refresh_token } = await tokenRes.json()
    console.log('✅ Received tokens; setting cookies')

    const res = NextResponse.redirect(`${new URL(redirectUri!).origin}/admin/dashboard`)
    const cookieOpts = {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path:     '/',
    }

    res.cookies.set('id_token',     id_token,        cookieOpts)
    res.cookies.set('access_token', access_token,    cookieOpts)
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
    const origin = new URL(process.env.COGNITO_REDIRECT_URI!).origin
    return NextResponse.redirect(`${origin}/api/auth/login`)
  }
}
