import { NextResponse } from 'next/server';
import { ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { ddb, TABLES } from '@/lib/aws';

export const runtime = 'nodejs';

/**
 * POST /api/email/[messageId]/allow
 * Allow a specific email (email only, not sender)
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
    const { reason } = body;

    console.log(`✅ Allowing email: ${messageId}`);

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

    // Update email to mark as allowed
    const updateEmailCommand = new UpdateItemCommand({
      TableName: TABLES.EMAILS,
      Key: {
        userId: { S: userId },
        receivedAt: { S: receivedAt }
      },
      UpdateExpression: 'SET #allowed = :allowed, #allowedAt = :allowedAt, #allowedReason = :allowedReason, #status = :status, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#allowed': 'allowed',
        '#allowedAt': 'allowedAt',
        '#allowedReason': 'allowedReason',
        '#status': 'status',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':allowed': { BOOL: true },
        ':allowedAt': { S: new Date().toISOString() },
        ':allowedReason': { S: reason || 'Allowed from investigation' },
        ':status': { S: 'allowed' },
        ':updatedAt': { S: new Date().toISOString() }
      }
    });

    await ddb.send(updateEmailCommand);

    console.log(`✅ Email allowed successfully: ${messageId}`);

    return NextResponse.json({
      success: true,
      messageId,
      allowed: true,
      allowedAt: new Date().toISOString()
    });

  } catch (err: any) {
    console.error('❌ Error allowing email:', err);
    return NextResponse.json(
      { error: 'Failed to allow email', details: err.message },
      { status: 500 }
    );
  }
}

