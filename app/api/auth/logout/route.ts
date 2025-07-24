import { NextResponse } from 'next/server'

export async function GET() {
  const domain = process.env.COGNITO_DOMAIN!
  const clientId = process.env.COGNITO_CLIENT_ID!
  const logoutUri = encodeURIComponent(process.env.COGNITO_LOGOUT_URI!)

  const res = NextResponse.redirect(
    `https://${domain}/logout?client_id=${clientId}&logout_uri=${logoutUri}`
  )
  for (const name of ['access_token','id_token','refresh_token']) {
    res.cookies.set(name, '', { maxAge: 0, path: '/' })
  }
  return res
}
