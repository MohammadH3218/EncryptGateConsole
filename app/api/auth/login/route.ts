// app/api/auth/login/route.ts
import { NextResponse } from 'next/server'
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'
import crypto from 'crypto'

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' })
const CLOUD_TABLE = process.env.CLOUD_TABLE_NAME || 'CloudServices'

const base64url = (b: string | Buffer) => Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest()

export async function GET(req: Request) {
  const url = new URL(req.url)
  const orgId = url.searchParams.get('orgId')
  const next = url.searchParams.get('next') || `/o/${orgId}/admin/dashboard`
  
  if (!orgId) return new NextResponse('Missing orgId', { status: 400 })

  // fetch CloudServices(orgId, 'cognito')
  const r = await ddb.send(new GetItemCommand({
    TableName: CLOUD_TABLE,
    Key: { orgId: { S: orgId }, serviceType: { S: 'aws-cognito' } }
  }))
  if (!r.Item) return new NextResponse('Cognito not configured for org', { status: 400 })

  const domain = r.Item.domain?.S
  const clientId = r.Item.clientId?.S
  const redirectUri = r.Item.redirectUri?.S || `${url.origin}/api/auth/callback`

  if (!domain || !clientId || !redirectUri) {
    return new NextResponse('Missing Cognito config values', { status: 400 })
  }

  // Generate PKCE challenge
  const codeVerifier = crypto.randomUUID().replace(/-/g,'')
  const codeChallenge = base64url(sha256(codeVerifier))
  const state = base64url(JSON.stringify({ orgId, next, t: Date.now() }))

  const loginUrl =
    `https://${domain}/login?client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code&scope=openid+email+phone` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&code_challenge=${codeChallenge}&code_challenge_method=S256` +
    `&state=${state}`

  const res = NextResponse.redirect(loginUrl)
  res.cookies.set('pkce_verifier', codeVerifier, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' })
  return res
}