// app/api/auth/login/route.ts
import { NextResponse } from 'next/server'
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' })
const CLOUD_TABLE = process.env.CLOUD_TABLE_NAME || 'CloudServices'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const orgId = url.searchParams.get('orgId')
  if (!orgId) return new NextResponse('Missing orgId', { status: 400 })

  // fetch CloudServices(orgId, 'cognito')
  const r = await ddb.send(new GetItemCommand({
    TableName: CLOUD_TABLE,
    Key: { orgId: { S: orgId }, serviceType: { S: 'cognito' } }
  }))
  if (!r.Item) return new NextResponse('Cognito not configured for org', { status: 400 })

  const domain = r.Item.domain?.S
  const clientId = r.Item.clientId?.S
  const redirectUri = r.Item.redirectUri?.S || `${url.origin}/api/auth/callback`

  if (!domain || !clientId || !redirectUri) {
    return new NextResponse('Missing Cognito config values', { status: 400 })
  }

  // carry orgId in state
  const state = encodeURIComponent(JSON.stringify({ orgId }))
  const loginUrl =
    `https://${domain}/login?client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code&scope=openid+email+phone` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`

  return NextResponse.redirect(loginUrl)
}