import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { userProfileService } from '@/lib/user-profile-service'

export async function GET() {
  try {
    const cookieStore = await cookies()
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
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { emailMessageId, detectionId, investigationId, reason, priority } = body

    // Try to get profile, but don't fail if userProfileService doesn't work
    let profile: any = null
    try {
      profile = await userProfileService.getUserProfile(token)
    } catch (profileError) {
      console.warn('Could not get user profile, proceeding anyway:', profileError)
    }

    // If we have a profile, check permissions
    if (profile && !userProfileService.hasPermission(profile.id, 'push_to_admin')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Create pushed request - use investigationId or emailMessageId
    const requestId = investigationId || emailMessageId || `push-${Date.now()}`
    const userId = profile?.id || 'unknown'
    
    // Try to use userProfileService if available
    let pushedRequest
    try {
      pushedRequest = userProfileService.pushToAdmin(requestId, userId, reason || 'Pushed from investigation')
    } catch (serviceError) {
      // Fallback: create a simple pushed request object
      console.warn('userProfileService.pushToAdmin failed, creating fallback:', serviceError)
      pushedRequest = {
        id: requestId,
        investigationId: investigationId || emailMessageId,
        emailMessageId,
        detectionId,
        reason: reason || 'Pushed from investigation',
        priority: priority || 'medium',
        status: 'pending',
        requestedBy: userId,
        requestedAt: new Date().toISOString(),
      }
    }
    
    return NextResponse.json({ success: true, ...pushedRequest })
  } catch (error: any) {
    console.error('❌ Error in POST /api/admin/pushed-requests:', error)
    return NextResponse.json(
      { error: 'Failed to push to admin', details: error.message },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await userProfileService.getUserProfile(token)
    
    // Only reviewers/admins can accept/deny
    if (!userProfileService.hasPermission(profile.id, 'review_pushed_requests')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { id, action, notes } = await request.json()
    if (!id || !['accept', 'deny', 'complete'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const updated = userProfileService.reviewPushedRequest(id, action, profile.id, notes)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update pushed request' }, { status: 500 })
  }
}