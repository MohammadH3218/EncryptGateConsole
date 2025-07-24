// app/api/auth/callback/route.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  if (!code) {
    return NextResponse.redirect('/api/auth/login')
  }

  const domain = process.env.COGNITO_DOMAIN!
  const tokenUrl = `https://${domain}/oauth2/token`
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.COGNITO_CLIENT_ID!,
    redirect_uri: process.env.COGNITO_REDIRECT_URI!,
    code,
  })

  // If you have a client secret, Cognito expects Basic auth
  const headers: Record<string,string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (process.env.COGNITO_CLIENT_SECRET) {
    const creds = Buffer.from(
      `${process.env.COGNITO_CLIENT_ID}:${process.env.COGNITO_CLIENT_SECRET}`
    ).toString('base64')
    headers.Authorization = `Basic ${creds}`
  }

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers,
    body: body.toString(),
  })

  if (!tokenRes.ok) {
    console.error('Token exchange error:', await tokenRes.text())
    return NextResponse.redirect('/api/auth/login')
  }

  const { access_token, id_token, refresh_token } = await tokenRes.json()

  const res = NextResponse.redirect('/admin/dashboard')
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }

  res.cookies.set('access_token', access_token, cookieOpts)
  res.cookies.set('id_token', id_token,        cookieOpts)
  if (refresh_token) {
    // expire refresh token in 30 days
    res.cookies.set('refresh_token', refresh_token, {
      ...cookieOpts,
      maxAge: 30 * 24 * 60 * 60,
    })
  }
  return res
}
