// app/api/auth/login/route.ts
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const orgId = url.searchParams.get('orgId')
  const next = url.searchParams.get('next')
  
  if (!orgId) return new NextResponse('Missing orgId', { status: 400 })

  // Redirect to the org-specific login page with next parameter
  const loginUrl = new URL(`/o/${orgId}/admin/login`, req.url)
  if (next) {
    loginUrl.searchParams.set('next', next)
  }
  
  return NextResponse.redirect(loginUrl)
}