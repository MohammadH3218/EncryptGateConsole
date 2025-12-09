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
    const { messageId: rawMessageId } = await params;
    // Decode the messageId in case it's URL encoded
    const messageId = decodeURIComponent(rawMessageId);
    const body = await request.json();
    const { sender, reason } = body;

    console.log(`🚫 Blocking email: ${messageId}, sender: ${sender}`);

    // Find the email - try multiple possible key structures
    const findEmailCommand = new ScanCommand({
      TableName: TABLES.EMAILS,
      FilterExpression: 'messageId = :messageId',
      ExpressionAttributeValues: {
        ':messageId': { S: messageId }
      },
      ProjectionExpression: 'userId, receivedAt, timestamp, createdAt',
      Limit: 1
    });

    const findResult = await ddb.send(findEmailCommand);

    if (!findResult.Items || findResult.Items.length === 0) {
      console.error(`❌ Email not found: ${messageId}`);
      return NextResponse.json(
        { error: 'Email not found', messageId },
        { status: 404 }
      );
    }

    const emailKey = findResult.Items[0];
    const userId = emailKey.userId?.S;
    const receivedAt = emailKey.receivedAt?.S || emailKey.timestamp?.S || emailKey.createdAt?.S;
    
    if (!userId || !receivedAt) {
      console.error(`❌ Invalid email key structure:`, { userId, receivedAt });
      return NextResponse.json(
        { error: 'Invalid email key structure' },
        { status: 500 }
      );
    }

    // Update email to mark as blocked
    const updateEmailCommand = new UpdateItemCommand({
      TableName: TABLES.EMAILS,
      Key: {
        userId: { S: userId },
        receivedAt: { S: receivedAt }
      },
      UpdateExpression: 'SET #blocked = :blocked, #blockedAt = :blockedAt, #blockedReason = :blockedReason, #status = :status, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#blocked': 'blocked',
        '#blockedAt': 'blockedAt',
        '#blockedReason': 'blockedReason',
        '#status': 'status',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':blocked': { BOOL: true },
        ':blockedAt': { S: new Date().toISOString() },
        ':blockedReason': { S: reason || 'Blocked from investigation' },
        ':status': { S: 'blocked' },
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

