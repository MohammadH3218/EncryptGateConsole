import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// Helper function to decode JWT token
function decodeJWT(token: string) {
  try {
    const [header, payload, signature] = token.split('.')
    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'))
    return decodedPayload
  } catch (error) {
    console.error('❌ Error decoding JWT token:', error)
    return null
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const idToken = cookieStore.get('id_token')?.value

    if (!idToken) {
      return NextResponse.json({ error: 'Unauthorized - No authentication token' }, { status: 401 })
    }

    // Decode the token to get user info
    const userInfo = decodeJWT(idToken)
    if (!userInfo || !userInfo.email) {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 })
    }

    // Mock investigation data for now
    const investigations = [
      {
        id: 'inv-1',
        title: 'Suspicious Email Investigation',
        status: 'active',
        assignedTo: userInfo.email,
        createdAt: new Date().toISOString()
      }
    ]
    
    return NextResponse.json({
      success: true,
      investigations,
      userEmail: userInfo.email
    })
  } catch (error) {
    console.error('❌ Error in GET /api/user/investigations:', error)
    return NextResponse.json({ error: 'Failed to get investigations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const idToken = cookieStore.get('id_token')?.value

    if (!idToken) {
      return NextResponse.json({ error: 'Unauthorized - No authentication token' }, { status: 401 })
    }

    // Decode the token to get user info
    const userInfo = decodeJWT(idToken)
    if (!userInfo || !userInfo.email) {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 })
    }

    const { investigationId, assignToUserId } = await request.json()

    // Mock assignment logic for now
    console.log('🔄 Assigning investigation:', { investigationId, assignToUserId, assignedBy: userInfo.email })
    
    return NextResponse.json({
      success: true,
      message: 'Investigation assigned successfully',
      investigationId,
      assignedTo: assignToUserId,
      assignedBy: userInfo.email
    })
  } catch (error) {
    console.error('❌ Error in POST /api/user/investigations:', error)
    return NextResponse.json({ error: 'Failed to assign investigation' }, { status: 500 })
  }
}
