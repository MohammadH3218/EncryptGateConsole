// app/api/detections/[id]/route.ts - CORRECTED FOR YOUR TABLE STRUCTURE
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DeleteItemCommand,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { ddb, TABLES } from '@/lib/aws';

const DETECTIONS_TABLE = TABLES.DETECTIONS;
const EMAILS_TABLE = TABLES.EMAILS;

console.log('🚨 Detection [id] API initialized with tables:', { DETECTIONS_TABLE, EMAILS_TABLE });

// Helper function to find detection - CORRECTED for your table structure
async function findDetectionByDetectionId(detectionId: string): Promise<any> {
  try {
    console.log('🔍 Scanning for detection with detectionId:', detectionId);
    
    // Try multiple possible table structures
    // Structure 1: detectionId (partition key) + receivedAt (sort key)
    // Structure 2: detectionId (partition key) + createdAt (sort key)
    // Structure 3: detectionId (partition key) + timestamp (sort key)
    
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
        createdAt: item.createdAt?.S,
        timestamp: item.timestamp?.S,
        emailMessageId: item.emailMessageId?.S
      });
      
      // Determine the sort key - try receivedAt first, then createdAt, then timestamp
      const sortKey = item.receivedAt?.S || item.createdAt?.S || item.timestamp?.S;
      const sortKeyName = item.receivedAt?.S ? 'receivedAt' : 
                         item.createdAt?.S ? 'createdAt' : 
                         item.timestamp?.S ? 'timestamp' : 'receivedAt';
      
      if (!sortKey) {
        console.error('❌ No sort key found for detection:', detectionId);
        // Try with just detectionId (if it's the only key)
        return {
          item: item,
          deleteKey: {
            detectionId: { S: item.detectionId?.S }
          }
        };
      }
      
      // Return both the item and the correct delete key for your table structure
      return {
        item: item,
        deleteKey: {
          detectionId: { S: item.detectionId?.S },
          [sortKeyName]: { S: sortKey }
        }
      };
    }
    
    console.log('❌ Detection not found:', detectionId);
    return null;
    
  } catch (error: any) {
    console.error('❌ Error scanning for detection:', {
      message: error.message,
      code: error.code,
      name: error.name
    });
    throw error; // Re-throw to be caught by caller
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
      console.error('❌ Step 2 FAILED: Error finding detection:', {
        message: findError.message,
        code: findError.code,
        name: findError.name,
        stack: findError.stack
      });
      return NextResponse.json(
        { 
          error: 'Error searching for detection', 
          details: findError.message,
          code: findError.code || findError.name
        },
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
    console.log('🗑️ Delete key:', JSON.stringify(deleteKey, null, 2));
    try {
      const deleteCommand = new DeleteItemCommand({
        TableName: DETECTIONS_TABLE,
        Key: deleteKey,
        // Add condition to ensure we're deleting the right item
        ConditionExpression: 'detectionId = :detectionId',
        ExpressionAttributeValues: {
          ':detectionId': { S: detectionId }
        }
      });

      await ddb.send(deleteCommand);
      console.log('✅ Step 3: Detection deleted successfully');

    } catch (dynamoError: any) {
      console.error('❌ Step 3 FAILED: DynamoDB delete error:', {
        message: dynamoError.message,
        code: dynamoError.code,
        name: dynamoError.name,
        deleteKey: deleteKey
      });
      
      // If it's a conditional check failure, the item might have been deleted already
      if (dynamoError.name === 'ConditionalCheckFailedException') {
        console.warn('⚠️ Detection may have been already deleted, continuing...');
        // Continue with email update
      } else {
        return NextResponse.json(
          {
            error: 'Failed to delete detection from database',
            details: dynamoError.message,
            code: dynamoError.code || dynamoError.name
          },
          { status: 500 }
        );
      }
    }

    // Step 4: Update email status to 'clean'
    if (emailMessageId) {
      console.log('📧 Step 4: Updating email status for:', emailMessageId);
      try {
        // Find the email - try multiple possible key structures
        const findEmailCommand = new ScanCommand({
          TableName: EMAILS_TABLE,
          FilterExpression: 'messageId = :messageId',
          ExpressionAttributeValues: {
            ':messageId': { S: emailMessageId }
          },
          ProjectionExpression: 'userId, receivedAt, timestamp, createdAt',
          Limit: 1
        });

        const findResult = await ddb.send(findEmailCommand);

        if (findResult.Items && findResult.Items.length > 0) {
          const emailKey = findResult.Items[0];
          
          // Determine the correct key structure
          const userId = emailKey.userId?.S;
          const receivedAt = emailKey.receivedAt?.S || emailKey.timestamp?.S || emailKey.createdAt?.S;
          
          if (!userId || !receivedAt) {
            console.warn('⚠️ Step 4: Cannot determine email key structure:', {
              hasUserId: !!userId,
              hasReceivedAt: !!receivedAt,
              hasTimestamp: !!emailKey.timestamp?.S,
              hasCreatedAt: !!emailKey.createdAt?.S
            });
          } else {
            // Update the email
            const updateEmailCommand = new UpdateItemCommand({
              TableName: EMAILS_TABLE,
              Key: {
                userId: { S: userId },
                receivedAt: { S: receivedAt }
              },
              UpdateExpression: 'SET #flaggedCategory = :flaggedCategory, #investigationStatus = :investigationStatus, #detectionId = :null, #flaggedBy = :flaggedBy, #flaggedAt = :null, #updatedAt = :updatedAt REMOVE #flaggedSeverity',
              ExpressionAttributeNames: {
                '#flaggedCategory': 'flaggedCategory',
                '#investigationStatus': 'investigationStatus',
                '#detectionId': 'detectionId',
                '#flaggedBy': 'flaggedBy',
                '#flaggedAt': 'flaggedAt',
                '#updatedAt': 'updatedAt',
                '#flaggedSeverity': 'flaggedSeverity'
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
          }
        } else {
          console.warn('⚠️ Step 4: Email not found:', emailMessageId);
        }
      } catch (emailUpdateError: any) {
        console.error('⚠️ Step 4 WARNING: Error updating email:', {
          message: emailUpdateError.message,
          code: emailUpdateError.code,
          name: emailUpdateError.name
        });
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