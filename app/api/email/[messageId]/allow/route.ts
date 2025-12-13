import { NextResponse } from 'next/server';
import { ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { ddb, TABLES } from '@/lib/aws';
import { getDriver } from '@/lib/neo4j';

export const runtime = 'nodejs';

// Helper function to normalize messageId (remove angle brackets if present)
function normalizeMessageId(messageId: string): string {
  return messageId.replace(/^<|>$/g, '');
}

// Helper function to try multiple messageId variations (handles encoding issues)
function getMessageIdVariations(messageId: string): string[] {
  const variations: string[] = [messageId];
  
  // Try with spaces replaced by underscores
  if (messageId.includes(' ')) {
    variations.push(messageId.replace(/ /g, '_'));
  }
  
  // Try with underscores replaced by spaces
  if (messageId.includes('_')) {
    variations.push(messageId.replace(/_/g, ' '));
  }
  
  // Try with plus signs replaced by underscores
  if (messageId.includes('+')) {
    variations.push(messageId.replace(/\+/g, '_'));
  }
  
  // Try with underscores replaced by plus signs
  if (messageId.includes('_')) {
    variations.push(messageId.replace(/_/g, '+'));
  }
  
  // Remove duplicates
  return [...new Set(variations)];
}

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
    let messageId = decodeURIComponent(rawMessageId);
    const body = await request.json();
    const { reason } = body;

    console.log(`✅ Allowing email: ${messageId}`);

    // Get all variations to try (handles encoding issues)
    const variations = getMessageIdVariations(messageId);
    const normalizedId = normalizeMessageId(messageId);
    if (normalizedId !== messageId && !variations.includes(normalizedId)) {
      variations.push(normalizedId);
    }
    
    // Also try with/without angle brackets
    const withBrackets = messageId.startsWith('<') ? messageId : `<${messageId}>`;
    const withoutBrackets = normalizeMessageId(messageId);
    if (!variations.includes(withBrackets)) variations.push(withBrackets);
    if (!variations.includes(withoutBrackets) && withoutBrackets !== messageId) {
      variations.push(withoutBrackets);
    }

    // Try each variation to find the email
    let emailItem: any = null;
    let foundMessageId = messageId;

    for (const variant of variations) {
      try {
        const findEmailCommand = new ScanCommand({
          TableName: TABLES.EMAILS,
          FilterExpression: 'messageId = :messageId',
          ExpressionAttributeValues: {
            ':messageId': { S: variant }
          },
          ProjectionExpression: 'userId, receivedAt, timestamp, createdAt, sender',
          Limit: 1
        });

        const findResult = await ddb.send(findEmailCommand);

        if (findResult.Items && findResult.Items.length > 0) {
          emailItem = findResult.Items[0];
          foundMessageId = variant;
          console.log(`✅ Found email with messageId variant: ${variant}`);
          break;
        }
      } catch (scanError: any) {
        console.warn(`⚠️ Error scanning for variant ${variant}:`, scanError.message);
        continue;
      }
    }

    if (!emailItem) {
      console.error(`❌ Email not found with any variant. Tried: ${variations.join(', ')}`);
      return NextResponse.json(
        { error: 'Email not found', messageId },
        { status: 404 }
      );
    }

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
        messageId: foundMessageId,
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

