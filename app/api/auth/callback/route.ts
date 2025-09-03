// app/api/auth/callback/route.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { Buffer } from 'buffer'
import {
  DynamoDBClient,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'

export const runtime = 'nodejs'

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' })
const ORG_ID = process.env.ORGANIZATION_ID!
const USERS_TABLE = process.env.USERS_TABLE_NAME || 'SecurityTeamUsers'

// Helper function to decode JWT token and extract user email
function decodeJWT(token: string) {
  try {
    const [header, payload, signature] = token.split('.')
    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'))
    return decodedPayload
  } catch (error) {
    console.error('❌ Error decoding JWT token:', error)
    return null
  }
}

// Helper function to update user's lastLogin timestamp
async function updateUserLastLogin(userEmail: string) {
  try {
    console.log('🔄 Updating lastLogin for user:', userEmail)
    
    await ddb.send(new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: {
        orgId: { S: ORG_ID },
        email: { S: userEmail }
      },
      UpdateExpression: 'SET lastLogin = :lastLogin',
      ExpressionAttributeValues: {
        ':lastLogin': { S: new Date().toISOString() }
      },
      ReturnValues: 'NONE'
    }))
    
    console.log('✅ Successfully updated lastLogin for:', userEmail)
  } catch (error) {
    console.error('⚠️ Failed to update lastLogin for:', userEmail, error)
  }
}

export async function GET(req: NextRequest) {
  try {
    console.log('↪️  Entering callback handler')
    console.log('🔍 Raw Request URL:', req.url)

    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    console.log('🔑 Authorization code received:', code ? 'YES' : 'NO')

    // HARDCODED VALUES - using the exact values provided
    const domain = 'us-east-1kpxz426n8.auth.us-east-1.amazoncognito.com'
    const clientId = 'u7p7ddajvruk8rccoajj8o5h0'
    const clientSecret = 'kvj3p3u5aa6o95f36ku3r6tpmg2irj6qc18bc5skjeats03ivih'
    const redirectUri = 'https://console-encryptgate.net/api/auth/callback'
    
    // Set absolute base URL for redirects
    const baseUrl = 'https://console-encryptgate.net'
    
    console.log('🔧 Using domain:', domain)
    console.log('🔧 Using clientId:', clientId)
    console.log('🔧 Client secret length:', clientSecret.length)
    console.log('🌐 Using redirectUri:', redirectUri)

    if (!code) {
      console.warn('⚠️ No code parameter found; redirecting to login')
      return NextResponse.redirect(`${baseUrl}/api/auth/login`)
    }

    // Exchange code for tokens
    const tokenUrl = `https://${domain}/oauth2/token`
    console.log('🚀 Fetching tokens from URL:', tokenUrl)

    try {
      // TRY METHOD 2: Include client_id and client_secret in the body
      // Instead of using the Authorization header
      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret, // Include secret in the body
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

      // Decode the ID token to get user information
      const userInfo = decodeJWT(id_token)
      if (userInfo && userInfo.email) {
        // Update user's lastLogin timestamp for activity status
        await updateUserLastLogin(userInfo.email)
      } else {
        console.warn('⚠️ Could not extract email from ID token for activity tracking')
      }

    const res = NextResponse.redirect(`${baseUrl}/admin/dashboard`);
    const cookieOpts = {
        httpOnly: true,
        secure: true, 
        sameSite: 'lax' as const,  // 'lax' is important for redirects
        path: '/',                 // Ensure cookies are available on all paths
        maxAge: 3600,              // Set expiration time in seconds (1 hour)
    };

    res.cookies.set('id_token', id_token, cookieOpts);
    res.cookies.set('access_token', access_token, cookieOpts);
    if (refresh_token) {
        res.cookies.set('refresh_token', refresh_token, {
            ...cookieOpts,
            maxAge: 30 * 24 * 60 * 60, // 30 days for refresh token
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