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
    const assignments = userProfileService.getUserAssignments(profile.id)
    
    return NextResponse.json(assignments)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get assignments' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await userProfileService.getUserProfile(token)
    
    // Check if user has permission to create assignments
    if (!userProfileService.hasPermission(profile.id, 'create_assignments')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const assignmentData = await request.json()
    const assignment = userProfileService.createAssignment({
      ...assignmentData,
      assignedBy: profile.id
    })
    
    return NextResponse.json(assignment)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 })
  }
}
