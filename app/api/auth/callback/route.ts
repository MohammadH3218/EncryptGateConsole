// app/api/auth/callback/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { Buffer } from 'buffer'

export const runtime = 'nodejs'  // ensure we're on Node, not Edge

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')

    if (!code) {
      console.warn('No code in callback, redirecting to login')
      return NextResponse.redirect('/api/auth/login')
    }

    // Load env-vars
    const domain      = process.env.COGNITO_DOMAIN
    const clientId    = process.env.COGNITO_CLIENT_ID
    const clientSecret= process.env.COGNITO_CLIENT_SECRET
    const redirectUri = process.env.COGNITO_REDIRECT_URI

    console.log('Callback env:', { domain, clientId, redirectUri })

    if (!domain || !clientId || !redirectUri) {
      console.error('Missing one of COGNITO_DOMAIN, COGNITO_CLIENT_ID or COGNITO_REDIRECT_URI')
      return NextResponse.redirect('/api/auth/login')
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
      return NextResponse.redirect('/api/auth/login')
    }

    const { id_token, access_token, refresh_token } = await tokenRes.json()
    console.log('Received tokens, setting cookies…')

    // Build the redirect response to /admin/dashboard
    const res = NextResponse.redirect('/admin/dashboard')
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
        maxAge: 30 * 24 * 60 * 60, // 30 days
      })
    }

    return res

  } catch (err) {
    console.error('Unhandled error in auth callback:', err)
    return NextResponse.redirect('/api/auth/login')
  }
}
