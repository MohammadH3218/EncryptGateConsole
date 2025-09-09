import { NextResponse } from 'next/server'
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'
import { Buffer } from 'buffer'

export const runtime = 'nodejs'
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' })
const CLOUD_TABLE = process.env.CLOUD_TABLE_NAME || 'CloudServices'

const base64urlDecode = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()

function parseState(s: string) {
  try {
    return JSON.parse(base64urlDecode(s))
  } catch {
    return null
  }
}

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

  const st = parseState(stateRaw)
  if (!st || !st.orgId) return NextResponse.redirect('/login?error=bad_state')

  // Parse cookies from request headers
  function getCookie(req: Request, name: string): string | undefined {
    const cookieHeader = req.headers.get('cookie');
    if (!cookieHeader) return undefined;
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(cookie => {
        const [key, ...v] = cookie.trim().split('=');
        return [key, v.join('=')];
      })
    );
    return cookies[name];
  }

  const codeVerifier = getCookie(req, 'pkce_verifier') || '';
  if (!codeVerifier) return NextResponse.redirect(`/o/${st.orgId}/login?error=missing_pkce`)

  // fetch config
  const r = await ddb.send(new GetItemCommand({
    TableName: CLOUD_TABLE,
    Key: { orgId: { S: st.orgId }, serviceType: { S: 'aws-cognito' } }
  }))
  if (!r.Item) return NextResponse.redirect(`/o/${st.orgId}/login?error=no_cognito_config`)

  const domain = r.Item.domain?.S
  const clientId = r.Item.clientId?.S
  const redirectUri = r.Item.redirectUri?.S || `${url.origin}/api/auth/callback`

  if (!domain || !clientId || !redirectUri) {
    return NextResponse.redirect(`/o/${st.orgId}/login?error=missing_config`)
  }

  const tokenUrl = `https://${domain}/oauth2/token`
  try {
    // Use PKCE flow (no client secret needed)
    let tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }).toString(),
    })

    const tokens = await tokenRes.json()
    if (!tokenRes.ok) return NextResponse.redirect(`/o/${st.orgId}/login?error=token&details=${encodeURIComponent(tokens.error_description||'')}`)

    const { id_token, access_token, refresh_token, expires_in } = tokens

    if (!id_token || !access_token) {
      return NextResponse.redirect(`/o/${st.orgId}/login?error=missing_tokens`)
    }

    // Set cookies hardened
    const opts = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' }
    const res = NextResponse.redirect(st.next || `/o/${st.orgId}/admin/dashboard`)
    res.cookies.set('id_token', id_token, opts)
    res.cookies.set('access_token', access_token, opts)
    if (refresh_token) res.cookies.set('refresh_token', refresh_token, { ...opts, maxAge: 30*24*3600 })
    res.cookies.set('org_id', st.orgId, { secure: true, sameSite: 'lax', path: '/' }) // readable by JS
    res.cookies.delete('pkce_verifier')
    return res
  } catch (err: any) {
    return NextResponse.redirect(`/o/${st.orgId}/login?error=unhandled_error&details=${encodeURIComponent(err.message || 'Unknown error')}`)
  }
}