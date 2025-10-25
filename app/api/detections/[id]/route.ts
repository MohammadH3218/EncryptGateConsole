// app/api/detections/[id]/route.ts - CORRECTED FOR YOUR TABLE STRUCTURE
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  DeleteItemCommand,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ORG_ID = process.env.ORGANIZATION_ID!;
const DETECTIONS_TABLE = process.env.DETECTIONS_TABLE_NAME || 'Detections';
const EMAILS_TABLE = process.env.EMAILS_TABLE_NAME || 'Emails';

console.log('🚨 Detection [id] API initialized with:', { REGION, ORG_ID, DETECTIONS_TABLE, EMAILS_TABLE });

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

// DELETE: remove a detection (unflag) - IMPROVED WITH BETTER ERROR HANDLING
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let detectionId: string = '';

  try {
    console.log('🚩 [START] DELETE /api/detections/[id]');

    // Step 1: Extract detection ID from params
    try {
      const resolvedParams = await params;
      detectionId = resolvedParams.id;
      console.log('✅ Step 1: Extracted detectionId:', detectionId);
    } catch (paramError: any) {
      console.error('❌ Step 1 FAILED: Error extracting params:', paramError);
      return NextResponse.json(
        { error: 'Invalid request parameters', details: paramError.message },
        { status: 400 }
      );
    }

    // Step 2: Find the detection
    console.log('🔍 Step 2: Searching for detection...');
    let detectionInfo;
    try {
      detectionInfo = await findDetectionByDetectionId(detectionId);
      console.log('✅ Step 2: Search completed, result:', detectionInfo ? 'found' : 'not found');
    } catch (findError: any) {
      console.error('❌ Step 2 FAILED: Error finding detection:', findError);
      return NextResponse.json(
        { error: 'Error searching for detection', details: findError.message },
        { status: 500 }
      );
    }

    if (!detectionInfo) {
      console.warn('⚠️ Detection not found, returning success (idempotent delete)');
      return NextResponse.json({
        success: true,
        message: 'Detection not found (may already be deleted)',
        detectionId: detectionId,
        action: 'already_deleted'
      });
    }

    const { item: detectionItem, deleteKey } = detectionInfo;
    const emailMessageId = detectionItem.emailMessageId?.S;

    console.log('📧 Detection info:', {
      detectionId,
      emailMessageId,
      deleteKey
    });

    // Step 3: Delete from DynamoDB
    console.log('🗑️ Step 3: Deleting detection from DynamoDB...');
    try {
      const deleteCommand = new DeleteItemCommand({
        TableName: DETECTIONS_TABLE,
        Key: deleteKey
      });

      await ddb.send(deleteCommand);
      console.log('✅ Step 3: Detection deleted successfully');

    } catch (dynamoError: any) {
      console.error('❌ Step 3 FAILED: DynamoDB delete error:', {
        message: dynamoError.message,
        code: dynamoError.code,
        name: dynamoError.name
      });
      return NextResponse.json(
        {
          error: 'Failed to delete detection from database',
          details: dynamoError.message,
          code: dynamoError.code
        },
        { status: 500 }
      );
    }

    // Step 4: Update email status to 'clean'
    if (emailMessageId) {
      console.log('📧 Step 4: Updating email status for:', emailMessageId);
      try {
        // Find the email
        const findEmailCommand = new ScanCommand({
          TableName: EMAILS_TABLE,
          FilterExpression: 'messageId = :messageId',
          ExpressionAttributeValues: {
            ':messageId': { S: emailMessageId }
          },
          ProjectionExpression: 'userId, receivedAt',
          Limit: 1
        });

        const findResult = await ddb.send(findEmailCommand);

        if (findResult.Items && findResult.Items.length > 0) {
          const emailKey = findResult.Items[0];

          // Update the email
          const updateEmailCommand = new UpdateItemCommand({
            TableName: EMAILS_TABLE,
            Key: {
              userId: { S: emailKey.userId?.S || '' },
              receivedAt: { S: emailKey.receivedAt?.S || '' }
            },
            UpdateExpression: 'SET #flaggedCategory = :flaggedCategory, #investigationStatus = :investigationStatus, #detectionId = :null, #flaggedBy = :flaggedBy, #flaggedAt = :null, #updatedAt = :updatedAt',
            ExpressionAttributeNames: {
              '#flaggedCategory': 'flaggedCategory',
              '#investigationStatus': 'investigationStatus',
              '#detectionId': 'detectionId',
              '#flaggedBy': 'flaggedBy',
              '#flaggedAt': 'flaggedAt',
              '#updatedAt': 'updatedAt'
            },
            ExpressionAttributeValues: {
              ':flaggedCategory': { S: 'clean' },
              ':investigationStatus': { S: 'resolved' },
              ':null': { NULL: true },
              ':flaggedBy': { S: 'Security Analyst' },
              ':updatedAt': { S: new Date().toISOString() }
            }
          });

          await ddb.send(updateEmailCommand);
          console.log('✅ Step 4: Email status updated to clean');
        } else {
          console.warn('⚠️ Step 4: Email not found:', emailMessageId);
        }
      } catch (emailUpdateError: any) {
        console.error('⚠️ Step 4 WARNING: Error updating email:', emailUpdateError.message);
        // Continue anyway - detection removal succeeded
      }
    } else {
      console.log('ℹ️ Step 4: Skipped (no emailMessageId)');
    }

    console.log('✅ [SUCCESS] DELETE completed successfully');
    return NextResponse.json({
      success: true,
      message: 'Detection unflagged successfully',
      detectionId: detectionId,
      emailMessageId: emailMessageId,
      action: 'unflagged'
    });

  } catch (err: any) {
    console.error('❌ [FATAL ERROR] DELETE /api/detections/[id]:', {
      detectionId,
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
        detectionId
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