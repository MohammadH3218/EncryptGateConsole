import { NextResponse } from 'next/server';
import { ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { ddb, TABLES } from '@/lib/aws';

export const runtime = 'nodejs';

/**
 * POST /api/email/[messageId]/block
 * Block an email and its sender
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await params;
    const body = await request.json();
    const { sender, reason } = body;

    console.log(`🚫 Blocking email: ${messageId}, sender: ${sender}`);

    // Find the email
    const findEmailCommand = new ScanCommand({
      TableName: TABLES.EMAILS,
      FilterExpression: 'messageId = :messageId',
      ExpressionAttributeValues: {
        ':messageId': { S: messageId }
      },
      ProjectionExpression: 'userId, receivedAt',
      Limit: 1
    });

    const findResult = await ddb.send(findEmailCommand);

    if (!findResult.Items || findResult.Items.length === 0) {
      return NextResponse.json(
        { error: 'Email not found' },
        { status: 404 }
      );
    }

    const emailKey = findResult.Items[0];

    // Update email to mark as blocked
    const updateEmailCommand = new UpdateItemCommand({
      TableName: TABLES.EMAILS,
      Key: {
        userId: { S: emailKey.userId?.S || '' },
        receivedAt: { S: emailKey.receivedAt?.S || '' }
      },
      UpdateExpression: 'SET #blocked = :blocked, #blockedAt = :blockedAt, #blockedReason = :blockedReason, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#blocked': 'blocked',
        '#blockedAt': 'blockedAt',
        '#blockedReason': 'blockedReason',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':blocked': { BOOL: true },
        ':blockedAt': { S: new Date().toISOString() },
        ':blockedReason': { S: reason || 'Blocked from investigation' },
        ':updatedAt': { S: new Date().toISOString() }
      }
    });

    await ddb.send(updateEmailCommand);

    // If sender is provided, also add to block list (you may want to create a separate BlockList table)
    if (sender) {
      // For now, we'll just log it. You can create a BlockList table later
      console.log(`📝 Sender ${sender} should be added to block list`);
    }

    console.log(`✅ Email blocked successfully: ${messageId}`);

    return NextResponse.json({
      success: true,
      messageId,
      sender,
      blocked: true,
      blockedAt: new Date().toISOString()
    });

  } catch (err: any) {
    console.error('❌ Error blocking email:', err);
    return NextResponse.json(
      { error: 'Failed to block email', details: err.message },
      { status: 500 }
    );
  }
}

