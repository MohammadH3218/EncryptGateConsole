// app/api/email/[messageId]/route.ts - FIXED VERSION
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  UpdateItemCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ORG_ID = process.env.ORGANIZATION_ID!;
const EMAILS_TABLE = process.env.EMAILS_TABLE_NAME || 'Emails';

console.log('📧 Email [messageId] API initialized with:', { REGION, ORG_ID, EMAILS_TABLE });

const ddb = new DynamoDBClient({ region: REGION });

// Helper function to find email by messageId
async function findEmailByMessageId(messageId: string): Promise<{userId: string, receivedAt: string} | null> {
  try {
    const scanCommand = new ScanCommand({
      TableName: EMAILS_TABLE,
      FilterExpression: 'messageId = :messageId',
      ExpressionAttributeValues: {
        ':messageId': { S: messageId }
      },
      ProjectionExpression: 'userId, receivedAt'
    });

    const result = await ddb.send(scanCommand);
    
    if (result.Items && result.Items.length > 0) {
      const item = result.Items[0];
      return {
        userId: item.userId?.S || '',
        receivedAt: item.receivedAt?.S || ''
      };
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error finding email by messageId:', error);
    return null;
  }
}

// PATCH: update email flagged status and attributes
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    console.log('📧 PATCH /api/email/[messageId] - Updating email status...');
    
    if (!ORG_ID) {
      return NextResponse.json(
        { error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    const { messageId } = await params;
    const body = await request.json();
    const { 
      flaggedCategory, 
      flaggedSeverity, 
      investigationStatus, 
      detectionId,
      flaggedBy,
      investigationNotes
    } = body;
    
    console.log('📝 Updating email status:', { 
      messageId, 
      flaggedCategory, 
      flaggedSeverity, 
      investigationStatus,
      detectionId 
    });

    // Validate flaggedCategory
    if (flaggedCategory && !['none', 'ai', 'manual', 'clean'].includes(flaggedCategory)) {
      return NextResponse.json(
        { error: 'Invalid flaggedCategory. Must be one of: none, ai, manual, clean' },
        { status: 400 }
      );
    }

    // Validate flaggedSeverity if provided
    if (flaggedSeverity && !['critical', 'high', 'medium', 'low'].includes(flaggedSeverity)) {
      return NextResponse.json(
        { error: 'Invalid flaggedSeverity. Must be one of: critical, high, medium, low' },
        { status: 400 }
      );
    }

    // Validate investigationStatus if provided
    if (investigationStatus && !['new', 'in_progress', 'resolved'].includes(investigationStatus)) {
      return NextResponse.json(
        { error: 'Invalid investigationStatus. Must be one of: new, in_progress, resolved' },
        { status: 400 }
      );
    }

    // Find the email by messageId
    const emailKey = await findEmailByMessageId(messageId);
    if (!emailKey) {
      return NextResponse.json(
        { error: 'Email not found' },
        { status: 404 }
      );
    }

    // Build update expression dynamically
    const updateExpressions: string[] = [];
    const attributeValues: Record<string, any> = {};
    const attributeNames: Record<string, string> = {};

    if (flaggedCategory !== undefined) {
      updateExpressions.push('#flaggedCategory = :flaggedCategory');
      attributeNames['#flaggedCategory'] = 'flaggedCategory';
      attributeValues[':flaggedCategory'] = { S: flaggedCategory };

      // If unflagging (setting to 'none' or 'clean'), remove severity and investigation status
      if (flaggedCategory === 'none' || flaggedCategory === 'clean') {
        updateExpressions.push('#flaggedSeverity = :null');
        updateExpressions.push('#investigationStatus = :null');
        updateExpressions.push('#detectionId = :null');
        attributeNames['#flaggedSeverity'] = 'flaggedSeverity';
        attributeNames['#investigationStatus'] = 'investigationStatus';
        attributeNames['#detectionId'] = 'detectionId';
        attributeValues[':null'] = { NULL: true };
      }
    }

    if (flaggedSeverity !== undefined && (flaggedCategory === 'ai' || flaggedCategory === 'manual')) {
      updateExpressions.push('#flaggedSeverity = :flaggedSeverity');
      attributeNames['#flaggedSeverity'] = 'flaggedSeverity';
      attributeValues[':flaggedSeverity'] = { S: flaggedSeverity };
    }

    if (investigationStatus !== undefined) {
      updateExpressions.push('#investigationStatus = :investigationStatus');
      attributeNames['#investigationStatus'] = 'investigationStatus';
      attributeValues[':investigationStatus'] = { S: investigationStatus };
    }

    if (detectionId !== undefined) {
      updateExpressions.push('#detectionId = :detectionId');
      attributeNames['#detectionId'] = 'detectionId';
      attributeValues[':detectionId'] = detectionId ? { S: detectionId } : { NULL: true };
    }

    if (flaggedBy !== undefined) {
      updateExpressions.push('#flaggedBy = :flaggedBy');
      attributeNames['#flaggedBy'] = 'flaggedBy';
      attributeValues[':flaggedBy'] = { S: flaggedBy };
    }

    if (investigationNotes !== undefined) {
      updateExpressions.push('#investigationNotes = :investigationNotes');
      attributeNames['#investigationNotes'] = 'investigationNotes';
      attributeValues[':investigationNotes'] = investigationNotes ? { S: investigationNotes } : { NULL: true };
    }

    // Always update the timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    attributeNames['#updatedAt'] = 'updatedAt';
    attributeValues[':updatedAt'] = { S: new Date().toISOString() };

    // Add flaggedAt timestamp if flagging
    if (flaggedCategory === 'ai' || flaggedCategory === 'manual') {
      updateExpressions.push('#flaggedAt = :flaggedAt');
      attributeNames['#flaggedAt'] = 'flaggedAt';
      attributeValues[':flaggedAt'] = { S: new Date().toISOString() };
    } else if (flaggedCategory === 'none' || flaggedCategory === 'clean') {
      updateExpressions.push('#flaggedAt = :null');
      attributeNames['#flaggedAt'] = 'flaggedAt';
    }

    const updateCommand = new UpdateItemCommand({
      TableName: EMAILS_TABLE,
      Key: {
        userId: { S: emailKey.userId },
        receivedAt: { S: emailKey.receivedAt }
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: attributeNames,
      ExpressionAttributeValues: attributeValues,
      ReturnValues: 'ALL_NEW'
    });

    const result = await ddb.send(updateCommand);
    console.log('✅ Email status updated successfully');

    return NextResponse.json({
      success: true,
      messageId,
      emailKey,
      updatedAttributes: {
        flaggedCategory,
        flaggedSeverity,
        investigationStatus,
        detectionId,
        flaggedBy,
        investigationNotes
      },
      updatedAt: new Date().toISOString()
    });

  } catch (err: any) {
    console.error('❌ [PATCH /api/email/[messageId]] error:', {
      message: err.message,
      code: err.code,
      name: err.name,
      stack: err.stack
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to update email status', 
        details: err.message,
        code: err.code || err.name
      },
      { status: 500 }
    );
  }
}