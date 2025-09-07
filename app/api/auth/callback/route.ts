import { NextResponse } from 'next/server'
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'
import { Buffer } from 'buffer'

export const runtime = 'nodejs'
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' })
const CLOUD_TABLE = process.env.CLOUD_TABLE_NAME || 'CloudServices'

function decodeJWT(token: string) {
  try {
    const [header, payload, signature] = token.split('.')
    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'))
    return decodedPayload
  } catch (error) {
    return null
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateRaw = url.searchParams.get('state')
  const baseUrl = url.origin

  if (!code || !stateRaw) return NextResponse.redirect('/login?error=missing_params')

  let orgId: string
  try {
    orgId = JSON.parse(decodeURIComponent(stateRaw)).orgId
  } catch {
    return NextResponse.redirect('/login?error=bad_state')
  }

  // fetch config
  const r = await ddb.send(new GetItemCommand({
    TableName: CLOUD_TABLE,
    Key: { orgId: { S: orgId }, serviceType: { S: 'cognito' } }
  }))
  if (!r.Item) return NextResponse.redirect('/login?error=no_cognito_config')

  const domain = r.Item.domain?.S
  const clientId = r.Item.clientId?.S
  const clientSecret = r.Item.clientSecret?.S
  const redirectUri = r.Item.redirectUri?.S || `${url.origin}/api/auth/callback`

  if (!domain || !clientId || !redirectUri) {
    return NextResponse.redirect('/login?error=missing_config')
  }

  const tokenUrl = `https://${domain}/oauth2/token`
  try {
    // Try with Authorization header if clientSecret is present
    let tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(clientSecret ? { 'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64') } : {})
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: redirectUri,
      }).toString(),
    })

    if (!tokenRes.ok && clientSecret) {
      // Try with client_secret in body if Authorization header fails
      tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
        }).toString(),
      })
    }

    if (!tokenRes.ok) {
      let errorText = 'Unknown error';
      try {
        errorText = await tokenRes.text();
      } catch {}
      return NextResponse.redirect(`${baseUrl}/api/auth/login?error=token_exchange_failed&details=${encodeURIComponent(errorText)}`)
    }

    const tokenData = await tokenRes.json();
    const { id_token, access_token, refresh_token, expires_in } = tokenData;

    if (!id_token || !access_token) {
      return NextResponse.redirect(`${baseUrl}/api/auth/login?error=missing_tokens`);
    }

    // Optionally decode and use user info
    // const userInfo = decodeJWT(id_token)

    const res = NextResponse.redirect(`${baseUrl}/admin`);
    const opts = { httpOnly: true, path: '/', maxAge: Math.max(300, Number(expires_in || 3600)) };
    res.cookies.set('id_token', id_token, opts);
    res.cookies.set('access_token', access_token, opts);
    if (refresh_token) res.cookies.set('refresh_token', refresh_token, { ...opts, maxAge: 30*24*3600 });
    res.cookies.set('org_id', orgId, { ...opts, httpOnly: false });
    return res;
  } catch (err: any) {
    return NextResponse.redirect(`${baseUrl}/api/auth/login?error=unhandled_error&details=${encodeURIComponent(err.message || 'Unknown error')}`);
  }
}