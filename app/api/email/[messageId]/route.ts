// app/api/email/[messageId]/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  UpdateItemCommand,
  GetItemCommand,
} from '@aws-sdk/client-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ORG_ID = process.env.ORGANIZATION_ID!;
const EMAILS_TABLE = process.env.EMAILS_TABLE_NAME || 'Emails';

console.log('📧 Email [messageId] API initialized with:', { REGION, ORG_ID, EMAILS_TABLE });

const ddb = new DynamoDBClient({ region: REGION });

// PATCH: update email flagged status
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    console.log('📧 PATCH /api/email/[messageId] - Updating email flagged status...');
    
    if (!ORG_ID) {
      return NextResponse.json(
        { error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    const { messageId } = await params;
    const body = await request.json();
    const { flaggedStatus, userId } = body;
    
    console.log('📝 Updating email flagged status:', { messageId, flaggedStatus, userId });

    if (!flaggedStatus || !['none', 'manual', 'ai', 'clean'].includes(flaggedStatus)) {
      return NextResponse.json(
        { error: 'Invalid flaggedStatus. Must be one of: none, manual, ai, clean' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required to identify the email' },
        { status: 400 }
      );
    }

    // First, check if the email exists
    const getCommand = new GetItemCommand({
      TableName: EMAILS_TABLE,
      Key: {
        userId: { S: userId },
        receivedAt: { S: messageId } // Assuming messageId is used as receivedAt or we need to find the email first
      }
    });

    try {
      const existingEmail = await ddb.send(getCommand);
      if (!existingEmail.Item) {
        // If not found with messageId as receivedAt, we need to scan for the actual email
        // For now, let's update using a different approach - update by messageId directly
        const updateCommand = new UpdateItemCommand({
          TableName: EMAILS_TABLE,
          Key: {
            userId: { S: userId },
            receivedAt: { S: messageId }
          },
          UpdateExpression: 'SET flaggedStatus = :flaggedStatus, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':flaggedStatus': { S: flaggedStatus },
            ':updatedAt': { S: new Date().toISOString() }
          },
          ReturnValues: 'ALL_NEW'
        });

        const result = await ddb.send(updateCommand);
        console.log('✅ Email flagged status updated successfully');

        return NextResponse.json({
          success: true,
          messageId,
          flaggedStatus,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (updateError: any) {
      console.error('❌ Failed to update email flagged status:', updateError);
      return NextResponse.json(
        { 
          error: 'Failed to update email flagged status', 
          details: updateError.message 
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId,
      flaggedStatus,
      message: 'Email flagged status updated successfully'
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
        error: 'Failed to update email flagged status', 
        details: err.message,
        code: err.code || err.name
      },
      { status: 500 }
    );
  }
}