import { NextResponse } from 'next/server';
import { ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { ddb, TABLES } from '@/lib/aws';
import { getDriver } from '@/lib/neo4j';

export const runtime = 'nodejs';

/**
 * POST /api/email/[messageId]/allow
 * Allow a specific email - mark as clean (not AI-flagged)
 * Updates both DynamoDB and Neo4j
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
      ProjectionExpression: 'userId, receivedAt, timestamp, createdAt, sender',
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

    const emailItem = findResult.Items[0];
    const userId = emailItem.userId?.S;
    const receivedAt = emailItem.receivedAt?.S || emailItem.timestamp?.S || emailItem.createdAt?.S;
    const sender = emailItem.sender?.S;

    if (!userId || !receivedAt) {
      console.error(`❌ Invalid email key structure:`, { userId, receivedAt });
      return NextResponse.json(
        { error: 'Invalid email key structure' },
        { status: 500 }
      );
    }

    // Update email in DynamoDB - change status from AI to clean
    const updateEmailCommand = new UpdateItemCommand({
      TableName: TABLES.EMAILS,
      Key: {
        userId: { S: userId },
        receivedAt: { S: receivedAt }
      },
      UpdateExpression: 'SET #allowed = :allowed, #allowedAt = :allowedAt, #allowedReason = :allowedReason, #status = :status, #flaggedCategory = :flaggedCategory, #flaggedStatus = :flaggedStatus, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#allowed': 'allowed',
        '#allowedAt': 'allowedAt',
        '#allowedReason': 'allowedReason',
        '#status': 'status',
        '#flaggedCategory': 'flaggedCategory',
        '#flaggedStatus': 'flaggedStatus',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':allowed': { BOOL: true },
        ':allowedAt': { S: new Date().toISOString() },
        ':allowedReason': { S: reason || 'Allowed from investigation - marked as clean' },
        ':status': { S: 'clean' },
        ':flaggedCategory': { S: 'clean' },
        ':flaggedStatus': { S: 'clean' },
        ':updatedAt': { S: new Date().toISOString() }
      }
    });

    await ddb.send(updateEmailCommand);

    // Update Neo4j - mark email as clean
    try {
      const driver = await getDriver();
      const session = driver.session();

      const neo4jUpdateQuery = `
        MATCH (e:Email {messageId: $messageId})
        SET e.allowed = true,
            e.allowedAt = datetime($allowedAt),
            e.allowedReason = $reason,
            e.status = 'clean',
            e.flaggedCategory = 'clean',
            e.flaggedStatus = 'clean',
            e.updatedAt = datetime($updatedAt)
        RETURN e
      `;

      await session.run(neo4jUpdateQuery, {
        messageId,
        allowedAt: new Date().toISOString(),
        reason: reason || 'Allowed from investigation - marked as clean',
        updatedAt: new Date().toISOString()
      });

      await session.close();
      console.log(`✅ Neo4j updated successfully for ${messageId}`);
    } catch (neo4jError) {
      console.error('⚠️ Failed to update Neo4j (continuing anyway):', neo4jError);
      // Don't fail the request if Neo4j update fails
    }

    console.log(`✅ Email allowed successfully: ${messageId}`);

    return NextResponse.json({
      success: true,
      messageId,
      sender,
      allowed: true,
      status: 'clean',
      flaggedCategory: 'clean',
      flaggedStatus: 'clean',
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

