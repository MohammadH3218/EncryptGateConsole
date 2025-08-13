// app/api/detections/[id]/route.ts - CORRECTED FOR YOUR TABLE STRUCTURE
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  DeleteItemCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ORG_ID = process.env.ORGANIZATION_ID!;
const DETECTIONS_TABLE = process.env.DETECTIONS_TABLE_NAME || 'Detections';

console.log('🚨 Detection [id] API initialized with:', { REGION, ORG_ID, DETECTIONS_TABLE });

const ddb = new DynamoDBClient({ region: REGION });

// Helper function to find detection - CORRECTED for your table structure
async function findDetectionByDetectionId(detectionId: string): Promise<any> {
  try {
    console.log('🔍 Scanning for detection with detectionId:', detectionId);
    
    // Your table structure: detectionId (partition key) + receivedAt (sort key)
    // We need to scan because we only have the detectionId, not the receivedAt
    const scanCommand = new ScanCommand({
      TableName: DETECTIONS_TABLE,
      FilterExpression: 'detectionId = :detectionId',
      ExpressionAttributeValues: {
        ':detectionId': { S: detectionId }
      },
      Limit: 1 // Should only be one match
    });
    
    const result = await ddb.send(scanCommand);
    
    if (result.Items && result.Items.length > 0) {
      const item = result.Items[0];
      console.log('✅ Found detection:', {
        detectionId: item.detectionId?.S,
        receivedAt: item.receivedAt?.S,
        emailMessageId: item.emailMessageId?.S
      });
      
      // Return both the item and the correct delete key for your table structure
      return {
        item: item,
        deleteKey: {
          detectionId: { S: item.detectionId?.S },
          receivedAt: { S: item.receivedAt?.S }
        }
      };
    }
    
    console.log('❌ Detection not found:', detectionId);
    return null;
    
  } catch (error: any) {
    console.error('❌ Error scanning for detection:', error);
    return null;
  }
}

// DELETE: remove a detection (unflag) - CORRECTED VERSION
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('🚩 DELETE /api/detections/[id] - Unflagging detection...');
    
    const { id: detectionId } = await params;
    console.log('🗑️ Attempting to delete detection:', detectionId);

    // Find the detection using the correct table structure
    const detectionInfo = await findDetectionByDetectionId(detectionId);
    
    if (!detectionInfo) {
      console.warn('⚠️ Detection not found:', detectionId);
      // Return success since it's already gone
      return NextResponse.json({
        success: true,
        message: 'Detection not found (may already be deleted)',
        detectionId: detectionId,
        action: 'already_deleted'
      });
    }

    const { item: detectionItem, deleteKey } = detectionInfo;
    
    // Extract email information
    const emailMessageId = detectionItem.emailMessageId?.S;
    const detectionData = {
      emailMessageId: emailMessageId,
      severity: detectionItem.severity?.S,
      name: detectionItem.name?.S,
      manualFlag: detectionItem.manualFlag?.BOOL
    };
    
    console.log('📧 Detection details:', detectionData);
    console.log('🔑 Delete key:', deleteKey);

    // Delete from DynamoDB using the correct key structure
    try {
      const deleteCommand = new DeleteItemCommand({
        TableName: DETECTIONS_TABLE,
        Key: deleteKey
      });

      console.log('💾 Deleting detection from DynamoDB...');
      await ddb.send(deleteCommand);
      console.log('✅ Detection deleted successfully from DynamoDB:', detectionId);
      
    } catch (dynamoError: any) {
      console.error('❌ DynamoDB delete failed:', dynamoError);
      return NextResponse.json(
        { error: 'Failed to delete detection from database', details: dynamoError.message },
        { status: 500 }
      );
    }

    // Update the email's status to 'clean' when unflagged
    if (emailMessageId) {
      try {
        console.log('📧 Updating email status to clean for:', emailMessageId);
        
        // Use internal helper function instead of HTTP call
        const { updateEmailAttributes } = await import('@/lib/email-helpers');
        
        const success = await updateEmailAttributes(emailMessageId, {
          flaggedCategory: 'clean',
          investigationStatus: 'resolved',
          flaggedBy: 'analyst',
          investigationNotes: `Detection "${detectionData?.name}" was unflagged and marked as clean by analyst.`
        });
        
        if (success) {
          console.log('✅ Email status updated to clean');
        } else {
          console.warn('⚠️ Failed to update email status');
        }
      } catch (emailUpdateError: any) {
        console.warn('⚠️ Error updating email status:', emailUpdateError.message);
        // Continue anyway - detection removal succeeded
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Detection unflagged successfully',
      detectionId: detectionId,
      emailMessageId: emailMessageId,
      action: 'unflagged',
      tableStructure: 'detectionId+receivedAt' // For debugging
    });

  } catch (err: any) {
    console.error('❌ [DELETE /api/detections/[id]] error:', {
      message: err.message,
      code: err.code,
      name: err.name
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to unflag detection', 
        details: err.message,
        code: err.code || err.name
      },
      { status: 500 }
    );
  }
}

// GET: get detection details - CORRECTED VERSION
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: detectionId } = await params;
    console.log('🔍 Getting detection details for:', detectionId);
    
    const detectionInfo = await findDetectionByDetectionId(detectionId);
    
    if (!detectionInfo) {
      return NextResponse.json(
        { error: 'Detection not found' },
        { status: 404 }
      );
    }
    
    const item = detectionInfo.item;
    
    const detection = {
      id: item.detectionId?.S,
      detectionId: item.detectionId?.S,
      emailMessageId: item.emailMessageId?.S,
      severity: item.severity?.S || 'low',
      name: item.name?.S || 'Unknown Detection',
      status: item.status?.S || 'new',
      assignedTo: item.assignedTo?.S ? JSON.parse(item.assignedTo.S) : [],
      sentBy: item.sentBy?.S || '',
      timestamp: item.timestamp?.S || item.receivedAt?.S,
      description: item.description?.S || '',
      indicators: item.indicators?.S ? JSON.parse(item.indicators.S) : [],
      recommendations: item.recommendations?.S ? JSON.parse(item.recommendations.S) : [],
      threatScore: parseInt(item.threatScore?.N || '0'),
      confidence: parseInt(item.confidence?.N || '50'),
      createdAt: item.createdAt?.S || item.receivedAt?.S,
      manualFlag: item.manualFlag?.BOOL || false
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