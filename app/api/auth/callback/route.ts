// app/api/auth/callback/route.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { Buffer } from 'buffer'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    console.log('↪️  Entering callback')
    console.log('🔍 Raw Request URL:', req.url)

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
    
    // Detailed environment variable logging
    console.log('🔍 Environment Variables:')
    console.log('COGNITO_DOMAIN:', domain)
    console.log('COGNITO_CLIENT_ID:', clientId)
    console.log('COGNITO_CLIENT_SECRET present?:', !!clientSecret)
    console.log('COGNITO_REDIRECT_URI:', redirectUri)
    console.log('📍 Base URL:', baseUrl)

    // Validate individual environment variables
    if (!domain) {
      console.error('❌ Missing COGNITO_DOMAIN environment variable')
      return new NextResponse('Server configuration error: Missing COGNITO_DOMAIN', { status: 500 })
    }
    
    if (!clientId) {
      console.error('❌ Missing COGNITO_CLIENT_ID environment variable')
      return new NextResponse('Server configuration error: Missing COGNITO_CLIENT_ID', { status: 500 })
    }
    
    if (!redirectUri) {
      console.error('❌ Missing COGNITO_REDIRECT_URI environment variable')
      return new NextResponse('Server configuration error: Missing COGNITO_REDIRECT_URI', { status: 500 })
    }

    if (!code) {
      console.warn('⚠️  No code; redirecting to login')
      return NextResponse.redirect(`${baseUrl}/api/auth/login`)
    }

    // Exchange code for tokens
    const tokenUrl = `https://${domain}/oauth2/token`
    console.log('🚀 Full token URL:', tokenUrl)

    try {
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

      const tokenData = await tokenRes.json()
      console.log('✅ Received tokens:', Object.keys(tokenData).join(', '))
      
      const { id_token, access_token, refresh_token } = tokenData
      
      if (!id_token || !access_token) {
        console.error('❌ Missing required tokens in response')
        return NextResponse.redirect(`${baseUrl}/api/auth/login`)
      }

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
    } catch (fetchError) {
      console.error('💥 Error during token exchange:', fetchError)
      return NextResponse.redirect(`${baseUrl}/api/auth/login`)
    }

  } catch (err: any) {
    console.error('💥 Unhandled error in callback:', err)
    console.error('Error message:', err.message)
    console.error('Error stack:', err.stack)
    // Use a hardcoded URL to avoid any URL construction errors
    return NextResponse.redirect('https://console-encryptgate.net/api/auth/login')
  }
}