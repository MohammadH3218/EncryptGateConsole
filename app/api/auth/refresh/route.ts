import { NextRequest, NextResponse } from 'next/server'
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' })
const CLOUD_TABLE = process.env.CLOUD_TABLE_NAME || 'CloudServices'

export async function POST(req: NextRequest) {
  try {
    const refreshToken = req.cookies.get('refresh_token')?.value
    const orgId = req.cookies.get('org_id')?.value
    
    if (!refreshToken || !orgId) {
      return NextResponse.json({ error: 'Missing refresh token or org context' }, { status: 401 })
    }

    // Get Cognito config for the org
    const r = await ddb.send(new GetItemCommand({
      TableName: CLOUD_TABLE,
      Key: { orgId: { S: orgId }, serviceType: { S: 'aws-cognito' } }
    }))
    
    if (!r.Item) {
      return NextResponse.json({ error: 'Organization auth config not found' }, { status: 400 })
    }

    const domain = r.Item.domain?.S
    const clientId = r.Item.clientId?.S
    
    if (!domain || !clientId) {
      return NextResponse.json({ error: 'Incomplete auth configuration' }, { status: 400 })
    }

    // Exchange refresh token for new access token
    const tokenUrl = `https://${domain}/oauth2/token`
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
      }).toString(),
    })

    if (!tokenRes.ok) {
      const errorData = await tokenRes.json().catch(() => ({}))
      return NextResponse.json({ 
        error: 'Token refresh failed', 
        details: errorData.error_description 
      }, { status: 401 })
    }

    const tokens = await tokenRes.json()
    const { access_token, id_token, expires_in } = tokens

    if (!access_token) {
      return NextResponse.json({ error: 'No access token in refresh response' }, { status: 400 })
    }

    // Set new tokens in cookies
    const opts = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' }
    const res = NextResponse.json({ success: true })
    
    res.cookies.set('access_token', access_token, { ...opts, maxAge: Math.max(300, Number(expires_in || 3600)) })
    if (id_token) {
      res.cookies.set('id_token', id_token, { ...opts, maxAge: Math.max(300, Number(expires_in || 3600)) })
    }
    
    return res
  } catch (error) {
    console.error('Token refresh error:', error)
    return NextResponse.json({ 
      error: 'Internal server error during token refresh' 
    }, { status: 500 })
  }
}