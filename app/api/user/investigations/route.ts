import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { userProfileService } from '@/lib/user-profile-service'

export async function GET() {
  try {
    const cookieStore = cookies()
    const token = cookieStore.get('session_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await userProfileService.getUserProfile(token)
    const investigations = userProfileService.getUserInvestigations(profile.id)
    
    return NextResponse.json(investigations)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get investigations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const token = cookieStore.get('session_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await userProfileService.getUserProfile(token)
    const { investigationId, assignToUserId } = await request.json()

    // Check if user has permission to assign investigations
    if (!userProfileService.hasPermission(profile.id, 'assign_investigations')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const result = userProfileService.assignInvestigation(investigationId, assignToUserId, profile.id)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to assign investigation' }, { status: 500 })
  }
}