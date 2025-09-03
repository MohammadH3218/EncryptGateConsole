// app/api/investigations/[id]/assign/route.ts - Assign investigation to user
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

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const messageId = decodeURIComponent(params.id)
    console.log('🔄 Assigning investigation for messageId:', messageId)

    const cookieStore = cookies()
    const idToken = cookieStore.get('id_token')?.value

    if (!idToken) {
      return NextResponse.json({ error: 'Unauthorized - No authentication token' }, { status: 401 })
    }

    // Decode the token to get user info
    const userInfo = decodeJWT(idToken)
    if (!userInfo || !userInfo.email) {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 })
    }

    const body = await request.json()
    const { assignToUserId, assignToUserName } = body

    console.log('📋 Assignment details:', {
      messageId,
      assignToUserId,
      assignToUserName,
      assignedBy: userInfo.email
    })

    // Mock assignment logic for now - in real implementation this would update a database
    const assignmentResult = {
      success: true,
      investigationId: messageId,
      assignedTo: assignToUserId || userInfo.email,
      assignedToName: assignToUserName || 'Current User',
      assignedBy: userInfo.email,
      assignedAt: new Date().toISOString(),
      status: 'assigned'
    }

    console.log('✅ Investigation assigned successfully:', assignmentResult)

    return NextResponse.json(assignmentResult)

  } catch (error: any) {
    console.error('❌ Error assigning investigation:', error)
    return NextResponse.json(
      { 
        error: 'Failed to assign investigation',
        details: error.message
      },
      { status: 500 }
    )
  }
}