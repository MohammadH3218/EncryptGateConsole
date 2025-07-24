import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { Buffer } from 'buffer'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')

    // If no code, bounce back to our own /api/auth/login
    if (!code) {
      console.warn('Callback missing code, redirecting to login')
      const loginUrl = new URL('/api/auth/login', req.url)
      return NextResponse.redirect(loginUrl)
    }

    // Load env vars
    const domain       = process.env.COGNITO_DOMAIN
    const clientId     = process.env.COGNITO_CLIENT_ID
    const clientSecret = process.env.COGNITO_CLIENT_SECRET
    const redirectUri  = process.env.COGNITO_REDIRECT_URI

    console.log('Callback env:', { domain, clientId, redirectUri })
    if (!domain || !clientId || !redirectUri) {
      console.error('Missing Cognito env vars!')
      const loginUrl = new URL('/api/auth/login', req.url)
      return NextResponse.redirect(loginUrl)
    }

    // Exchange code for tokens
    const tokenUrl = `https://${domain}/oauth2/token`
    const body = new URLSearchParams({
      grant_type:   'authorization_code',
      client_id:    clientId,
      redirect_uri: redirectUri,
      code,
    })

    const headers: Record<string,string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    }
    if (clientSecret) {
      const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
      headers.Authorization = `Basic ${creds}`
    }

    const tokenRes = await fetch(tokenUrl, {
      method:  'POST',
      headers,
      body:    body.toString(),
    })

    if (!tokenRes.ok) {
      const text = await tokenRes.text()
      console.error('Token exchange failed:', tokenRes.status, text)
      const loginUrl = new URL('/api/auth/login', req.url)
      return NextResponse.redirect(loginUrl)
    }

    const { id_token, access_token, refresh_token } = await tokenRes.json()
    console.log('Tokens received, setting cookies…')

    // Build response that sets cookies then redirects to /admin/dashboard
    const res = NextResponse.redirect(new URL('/admin/dashboard', req.url))
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

    return res

  } catch (err) {
    console.error('Unhandled error in auth callback:', err)
    const loginUrl = new URL('/api/auth/login', req.url)
    return NextResponse.redirect(loginUrl)
  }
}
