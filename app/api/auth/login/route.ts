import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  // 🔥 DEBUGGING LOG (remove once fixed)
  console.log('>>> LOGIN ENV', {
    DOMAIN:      process.env.COGNITO_DOMAIN,
    CLIENT_ID:   process.env.COGNITO_CLIENT_ID,
    REDIRECT:    process.env.COGNITO_REDIRECT_URI,
  })

  const domain      = process.env.COGNITO_DOMAIN!
  const clientId    = process.env.COGNITO_CLIENT_ID!
  const redirectUri = encodeURIComponent(process.env.COGNITO_REDIRECT_URI!)

  const loginUrl = `https://${domain}/login?client_id=${clientId}` +
                   `&response_type=code&scope=email+openid+phone` +
                   `&redirect_uri=${redirectUri}`

  return NextResponse.redirect(loginUrl)
}
