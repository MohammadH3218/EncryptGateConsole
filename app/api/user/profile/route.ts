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
    return NextResponse.json(profile)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get profile' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const token = cookieStore.get('session_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentProfile = await userProfileService.getUserProfile(token)
    
    // Check if user has permission to update profiles
    if (!userProfileService.hasPermission(currentProfile.id, 'manage_users')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { userId, role } = await request.json()
    const updatedProfile = userProfileService.updateUserRole(userId, role)
    
    if (!updatedProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json(updatedProfile)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}