// app/api/auth/callback/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { Buffer } from 'buffer'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')

    // derive your frontend origin from the REDIRECT_URI env
    const frontendOrigin = new URL(process.env.COGNITO_REDIRECT_URI!).origin

    // no code → send back to our login route
    if (!code) {
      return NextResponse.redirect(`${frontendOrigin}/api/auth/login`)
    }

    // pull in the same env-vars you already have
    const domain       = process.env.COGNITO_DOMAIN!
    const clientId     = process.env.COGNITO_CLIENT_ID!
    const clientSecret = process.env.COGNITO_CLIENT_SECRET
    const redirectUri  = process.env.COGNITO_REDIRECT_URI!

    // exchange code for tokens
    const tokenRes = await fetch(`https://${domain}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(clientSecret && {
          Authorization: `Basic ${Buffer.from(
            `${clientId}:${clientSecret}`
          ).toString('base64')}`,
        }),
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        client_id:    clientId,
        redirect_uri: redirectUri,
        code,
      }),
    })

    if (!tokenRes.ok) {
      // failed exchange → bounce back
      return NextResponse.redirect(`${frontendOrigin}/api/auth/login`)
    }

    const { id_token, access_token, refresh_token } = await tokenRes.json()

    // set httpOnly cookies, then send them to /admin/dashboard
    const res = NextResponse.redirect(`${frontendOrigin}/admin/dashboard`)
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
    // anything blows up → send back to login
    const origin = new URL(process.env.COGNITO_REDIRECT_URI!).origin
    return NextResponse.redirect(`${origin}/api/auth/login`)
  }
}
