import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { userProfileService } from '@/lib/user-profile-service'

export async function GET() {
  try {
    const cookieStore = cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await userProfileService.getUserProfile(token)
    
    // Check if user has permission to view blocked emails
    if (!userProfileService.hasPermission(profile.id, 'view_blocked_emails')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const blockedEmails = userProfileService.getAllBlockedEmails()
    return NextResponse.json(blockedEmails)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get blocked emails' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await userProfileService.getUserProfile(token)
    
    // Check if user has permission to block emails
    if (!userProfileService.hasPermission(profile.id, 'block_emails')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { email, reason, notes } = await request.json()
    const blockedEmail = userProfileService.blockEmail(email, reason, profile.id, notes)
    
    return NextResponse.json(blockedEmail)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to block email' }, { status: 500 })
  }
}