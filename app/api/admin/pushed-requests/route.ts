import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { PutItemCommand, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { ddb, TABLES, extractOrgId } from '@/lib/aws'
import { v4 as uuidv4 } from 'uuid'

export const runtime = 'nodejs'

/**
 * GET /api/admin/pushed-requests
 * Get all pushed requests for admin review
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Extract orgId from request if available
    const orgId = extractOrgId(request)
    
    // Scan all pushed requests from DynamoDB (filter by orgId if provided)
    const scanCommand = new ScanCommand({
      TableName: TABLES.PUSHED_REQUESTS,
      ...(orgId ? {
        FilterExpression: 'orgId = :orgId',
        ExpressionAttributeValues: {
          ':orgId': { S: orgId }
        }
      } : {})
    })

    const result = await ddb.send(scanCommand)

    // Convert DynamoDB items to plain objects
    const pushedRequests = (result.Items || []).map(item => ({
      id: item.id?.S,
      orgId: item.orgId?.S,
      investigationId: item.investigationId?.S,
      emailMessageId: item.emailMessageId?.S,
      detectionId: item.detectionId?.S,
      reason: item.reason?.S,
      priority: item.priority?.S,
      status: item.status?.S,
      requestedBy: item.requestedBy?.S,
      requestedAt: item.requestedAt?.S,
      reviewedBy: item.reviewedBy?.S,
      reviewedAt: item.reviewedAt?.S,
      adminNotes: item.adminNotes?.S,
    }))

    return NextResponse.json(pushedRequests)
  } catch (error: any) {
    console.error('❌ Error getting pushed requests:', error)
    return NextResponse.json(
      { error: 'Failed to get pushed requests', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/pushed-requests
 * Create a new pushed request (escalate investigation to admin)
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { emailMessageId, detectionId, investigationId, reason, priority, orgId: bodyOrgId } = body

    if (!emailMessageId && !investigationId) {
      return NextResponse.json(
        { error: 'emailMessageId or investigationId is required' },
        { status: 400 }
      )
    }

    // Extract orgId from request or body
    const orgId = bodyOrgId || extractOrgId(request)
    if (!orgId) {
      return NextResponse.json(
        { error: 'orgId is required' },
        { status: 400 }
      )
    }

    // Create pushed request ID
    const requestId = uuidv4()
    const now = new Date().toISOString()

    // Store in DynamoDB
    const putCommand = new PutItemCommand({
      TableName: TABLES.PUSHED_REQUESTS,
      Item: {
        id: { S: requestId },
        orgId: { S: orgId },
        investigationId: { S: investigationId || emailMessageId },
        emailMessageId: { S: emailMessageId },
        detectionId: { S: detectionId || 'N/A' },
        reason: { S: reason || 'Pushed from investigation' },
        priority: { S: priority || 'medium' },
        status: { S: 'pending' },
        requestedBy: { S: 'analyst' }, // TODO: Get from token/user profile
        requestedAt: { S: now },
        createdAt: { S: now },
        updatedAt: { S: now },
      }
    })

    await ddb.send(putCommand)

    console.log(`✅ Pushed request created: ${requestId}`)

    return NextResponse.json({
      success: true,
      id: requestId,
      orgId,
      investigationId: investigationId || emailMessageId,
      emailMessageId,
      detectionId: detectionId || 'N/A',
      reason: reason || 'Pushed from investigation',
      priority: priority || 'medium',
      status: 'pending',
      requestedBy: 'analyst',
      requestedAt: now,
    })
  } catch (error: any) {
    console.error('❌ Error in POST /api/admin/pushed-requests:', error)
    return NextResponse.json(
      { error: 'Failed to push to admin', details: error.message },
      { status: 500 }
    )
  }
}

// PUT handler for updating pushed request status (for future implementation)
// TODO: Implement proper review/update logic with DynamoDB and user authentication
export async function PUT(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, action, notes, status } = await request.json()
    if (!id || !['accept', 'deny', 'complete'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // TODO: Get user info from token and update pushed request in DynamoDB
    // For now, return not implemented
    return NextResponse.json(
      { error: 'Update functionality not yet implemented' },
      { status: 501 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to update pushed request', details: error.message },
      { status: 500 }
    )
  }
}