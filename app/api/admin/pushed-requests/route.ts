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
    
    // Check if user has permission to view pushed requests
    if (!userProfileService.hasPermission(profile.id, 'view_pushed_requests')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const pushedRequests = userProfileService.getAllPushedRequests()
    return NextResponse.json(pushedRequests)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get pushed requests' }, { status: 500 })
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
    
    // Check if user has permission to push to admin
    if (!userProfileService.hasPermission(profile.id, 'push_to_admin')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { investigationId, reason } = await request.json()
    const pushedRequest = userProfileService.pushToAdmin(investigationId, profile.id, reason)
    
    return NextResponse.json(pushedRequest)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to push to admin' }, { status: 500 })
  }
}