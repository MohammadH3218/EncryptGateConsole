// app/api/detections/[id]/route.ts - UPDATED VERSION
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  DeleteItemCommand,
  GetItemCommand,
} from '@aws-sdk/client-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ORG_ID = process.env.ORGANIZATION_ID!;
const DETECTIONS_TABLE = process.env.DETECTIONS_TABLE_NAME || 'Detections';

if (!ORG_ID) {
  console.error('❌ Missing ORGANIZATION_ID environment variable');
}

console.log('🚨 Detection [id] API initialized with:', { REGION, ORG_ID, DETECTIONS_TABLE });

const ddb = new DynamoDBClient({ region: REGION });

// DELETE: remove a detection (unflag)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('🚩 DELETE /api/detections/[id] - Unflagging detection...');
    
    if (!ORG_ID) {
      return NextResponse.json(
        { error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    const { id: detectionId } = await params;
    console.log('🗑️ Deleting detection:', detectionId);

    // First, get the detection to find the email messageId
    let emailMessageId = null;
    let detectionData = null;
    
    try {
      const getCommand = new GetItemCommand({
        TableName: DETECTIONS_TABLE,
        Key: {
          orgId: { S: ORG_ID },
          detectionId: { S: detectionId }
        }
      });
      
      const detection = await ddb.send(getCommand);
      
      if (detection.Item) {
        emailMessageId = detection.Item.emailMessageId?.S;
        detectionData = {
          emailMessageId: detection.Item.emailMessageId?.S,
          severity: detection.Item.severity?.S,
          name: detection.Item.name?.S,
          manualFlag: detection.Item.manualFlag?.BOOL
        };
        console.log('📧 Found detection details:', detectionData);
      } else {
        console.warn('⚠️ Detection not found:', detectionId);
        return NextResponse.json(
          { error: 'Detection not found' },
          { status: 404 }
        );
      }
    } catch (getError: any) {
      console.error('❌ Error getting detection details:', getError.message);
      return NextResponse.json(
        { error: 'Failed to get detection details' },
        { status: 500 }
      );
    }

    // Delete from DynamoDB
    const deleteCommand = new DeleteItemCommand({
      TableName: DETECTIONS_TABLE,
      Key: {
        orgId: { S: ORG_ID },
        detectionId: { S: detectionId }
      }
    });

    console.log('💾 Deleting detection from DynamoDB:', detectionId);
    
    try {
      await ddb.send(deleteCommand);
      console.log('✅ Detection deleted successfully from DynamoDB:', detectionId);
    } catch (dynamoError: any) {
      console.error('❌ DynamoDB delete failed:', dynamoError.message);
      return NextResponse.json(
        { error: 'Failed to delete detection from database' },
        { status: 500 }
      );
    }

    // Update the email's status to 'clean' when unflagged
    if (emailMessageId) {
      try {
        console.log('📧 Updating email status to clean for:', emailMessageId);
        
        const emailUpdateResponse = await fetch(`${process.env.BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/email/${emailMessageId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            flaggedCategory: 'clean',
            flaggedSeverity: undefined, // Remove severity
            investigationStatus: 'resolved', // Mark as resolved
            detectionId: undefined, // Remove detection link
            flaggedBy: 'analyst', // Who unflagged it
            investigationNotes: `Detection "${detectionData?.name}" was unflagged and marked as clean by analyst.`
          })
        });
        
        if (emailUpdateResponse.ok) {
          const updateResult = await emailUpdateResponse.json();
          console.log('✅ Email status updated to clean:', updateResult);
        } else {
          const errorData = await emailUpdateResponse.json();
          console.warn('⚠️ Failed to update email status:', errorData);
          // Don't fail the whole operation if email update fails
        }
      } catch (emailUpdateError: any) {
        console.warn('⚠️ Error updating email status:', emailUpdateError.message);
        // Don't fail the whole operation if email update fails
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Detection unflagged successfully',
      detectionId: detectionId,
      emailMessageId: emailMessageId,
      action: 'unflagged'
    });

  } catch (err: any) {
    console.error('❌ [DELETE /api/detections/[id]] error:', {
      message: err.message,
      code: err.code,
      name: err.name,
      stack: err.stack
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to unflag detection', 
        details: err.message,
        code: err.code || err.name,
        troubleshooting: 'Check your AWS credentials, table name, and organization ID'
      },
      { status: 500 }
    );
  }
}

// GET: get detection details
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: detectionId } = await params;
    
    const getCommand = new GetItemCommand({
      TableName: DETECTIONS_TABLE,
      Key: {
        orgId: { S: ORG_ID },
        detectionId: { S: detectionId }
      }
    });
    
    const result = await ddb.send(getCommand);
    
    if (!result.Item) {
      return NextResponse.json(
        { error: 'Detection not found' },
        { status: 404 }
      );
    }
    
    const detection = {
      id: result.Item.detectionId?.S,
      detectionId: result.Item.detectionId?.S,
      emailMessageId: result.Item.emailMessageId?.S,
      severity: result.Item.severity?.S || 'low',
      name: result.Item.name?.S || 'Unknown Detection',
      status: result.Item.status?.S || 'new',
      assignedTo: result.Item.assignedTo?.S ? JSON.parse(result.Item.assignedTo.S) : [],
      sentBy: result.Item.sentBy?.S || '',
      timestamp: result.Item.timestamp?.S,
      description: result.Item.description?.S || '',
      indicators: result.Item.indicators?.S ? JSON.parse(result.Item.indicators.S) : [],
      recommendations: result.Item.recommendations?.S ? JSON.parse(result.Item.recommendations.S) : [],
      threatScore: parseInt(result.Item.threatScore?.N || '0'),
      confidence: parseInt(result.Item.confidence?.N || '50'),
      createdAt: result.Item.createdAt?.S,
      manualFlag: result.Item.manualFlag?.BOOL || false
    };
    
    return NextResponse.json(detection);
    
  } catch (err: any) {
    console.error('❌ [GET /api/detections/[id]] error:', err);
    return NextResponse.json(
      { error: 'Failed to get detection', details: err.message },
      { status: 500 }
    );
  }
}