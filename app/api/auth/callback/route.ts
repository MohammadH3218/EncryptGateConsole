// app/api/auth/callback/route.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { Buffer } from 'buffer'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    console.log('↪️  Entering callback handler')
    console.log('🔍 Raw Request URL:', req.url)

    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    console.log('🔑 Authorization code received:', code ? 'YES' : 'NO')

    // HARDCODED VALUES FOR TESTING
    const domain = 'us-east-1kpxz426n8.auth.us-east-1.amazoncognito.com'
    const clientId = 'u7p7ddajvruk8rccoajj8o5h0' 
    const clientSecret = process.env.COGNITO_CLIENT_SECRET || '' // Keep trying to get this from env
    const redirectUri = 'https://console-encryptgate.net/api/auth/callback'
    
    // Set absolute base URL for redirects
    const baseUrl = 'https://console-encryptgate.net'
    
    console.log('🔧 Using domain:', domain)
    console.log('🔧 Using clientId:', clientId)
    console.log('🔧 Client secret present?', clientSecret ? 'YES' : 'NO')
    console.log('🌐 Using redirectUri:', redirectUri)

    if (!code) {
      console.warn('⚠️ No code parameter found; redirecting to login')
      return NextResponse.redirect(`${baseUrl}/api/auth/login`)
    }

    // Exchange code for tokens
    const tokenUrl = `https://${domain}/oauth2/token`
    console.log('🚀 Fetching tokens from URL:', tokenUrl)

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
        }).toString(),
      })

      console.log('🎫 Token response status:', tokenRes.status)
      
      if (!tokenRes.ok) {
        let errorText = 'Unknown error';
        try {
          errorText = await tokenRes.text();
          console.error('❌ Token exchange failed:', errorText);
        } catch (textError) {
          console.error('❌ Token exchange failed and could not read response');
        }
        
        return NextResponse.redirect(`${baseUrl}/api/auth/login?error=token_exchange_failed&details=${encodeURIComponent(errorText)}`)
      }

      const tokenData = await tokenRes.json();
      console.log('✅ Token types received:', Object.keys(tokenData).join(', '));
      
      const { id_token, access_token, refresh_token } = tokenData;
      
      if (!id_token || !access_token) {
        console.error('❌ Missing required tokens in response');
        return NextResponse.redirect(`${baseUrl}/api/auth/login?error=missing_tokens`);
      }

      const res = NextResponse.redirect(`${baseUrl}/admin/dashboard`);
      const cookieOpts = {
        httpOnly: true,
        secure: true,
        sameSite: 'lax' as const,
        path: '/',
      };

      res.cookies.set('id_token', id_token, cookieOpts);
      res.cookies.set('access_token', access_token, cookieOpts);
      
      if (refresh_token) {
        res.cookies.set('refresh_token', refresh_token, {
          ...cookieOpts,
          maxAge: 30 * 24 * 60 * 60, // 30 days
        });
      }

      console.log('🚩 Successfully set cookies, redirecting to dashboard');
      return res;
    } catch (fetchError: any) {
      console.error('💥 Error during token exchange:', fetchError.message || fetchError);
      console.error('Error stack:', fetchError.stack);
      
      return NextResponse.redirect(`${baseUrl}/api/auth/login?error=fetch_error&details=${encodeURIComponent(fetchError.message || 'Unknown fetch error')}`);
    }

  } catch (err: any) {
    console.error('💥 Unhandled error in callback:', err.message || err);
    console.error('Error stack:', err.stack);
    
    // Use a hardcoded URL with error details for debugging
    return NextResponse.redirect('https://console-encryptgate.net/api/auth/login?error=unhandled_error');
  }
}