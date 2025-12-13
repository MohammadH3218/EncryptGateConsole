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
 * POST /api/email/allow
 * Allow a specific email - mark as clean (not AI-flagged)
 * Updates both DynamoDB and Neo4j
 * messageId should be passed in the request body
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messageId, reason } = body;

    if (!messageId) {
      return NextResponse.json(
        { error: 'messageId is required in request body' },
        { status: 400 }
      );
    }

    console.log(`✅ Allowing email: ${messageId}`);

    // Get all variations to try (handles encoding issues)
    const variations: string[] = [];
    
    // Add original first
    variations.push(messageId);
    
    // Normalize (remove angle brackets)
    const normalizedId = normalizeMessageId(messageId);
    if (normalizedId !== messageId) {
      variations.push(normalizedId);
    }
    
    // Try with angle brackets if not already there
    if (!messageId.startsWith('<')) {
      variations.push(`<${messageId}>`);
    }
    if (!normalizedId.startsWith('<')) {
      variations.push(`<${normalizedId}>`);
    }
    
    // Try encoding variations
    const encodingVariations = getMessageIdVariations(messageId);
    variations.push(...encodingVariations);
    
    // Also try encoding variations of normalized version
    const normalizedEncodingVariations = getMessageIdVariations(normalizedId);
    normalizedEncodingVariations.forEach(v => {
      if (!variations.includes(v)) variations.push(v);
    });
    
    // Remove duplicates
    const uniqueVariations = [...new Set(variations)];
    
    console.log(`🔍 Will try ${uniqueVariations.length} messageId variations:`, uniqueVariations.slice(0, 5).map(v => v.substring(0, 50) + '...'));

    // Try each variation to find the email
    let emailItem: any = null;
    let foundMessageId = messageId;

    for (const variant of uniqueVariations) {
      try {
        const findEmailCommand = new ScanCommand({
          TableName: TABLES.EMAILS,
          FilterExpression: 'messageId = :messageId',
          ExpressionAttributeValues: {
            ':messageId': { S: variant }
          },
          ProjectionExpression: 'userId, receivedAt, timestamp, createdAt, sender, messageId',
          Limit: 10  // Increase limit to see more results for debugging
        });

        const findResult = await ddb.send(findEmailCommand);

        if (findResult.Items && findResult.Items.length > 0) {
          emailItem = findResult.Items[0];
          foundMessageId = variant;
          console.log(`✅ Found email with messageId variant: ${variant}`);
          console.log(`📧 Stored messageId in DB: ${emailItem.messageId?.S}`);
          break;
        } else if (findResult.Items && findResult.Items.length > 0) {
          // Log all found items for debugging
          console.log(`⚠️ Found ${findResult.Items.length} items but didn't match exactly`);
          findResult.Items.forEach((item, idx) => {
            console.log(`  Item ${idx}: messageId="${item.messageId?.S}"`);
          });
        }
      } catch (scanError: any) {
        console.warn(`⚠️ Error scanning for variant ${variant}:`, scanError.message);
        continue;
      }
    }

    if (!emailItem) {
      // Try a broader scan to see what messageIds actually exist (using begins_with since contains isn't available)
      try {
        // Try scanning a few items to see messageId format
        const sampleScan = new ScanCommand({
          TableName: TABLES.EMAILS,
          ProjectionExpression: 'messageId',
          Limit: 10
        });
        const sampleResult = await ddb.send(sampleScan);
        if (sampleResult.Items && sampleResult.Items.length > 0) {
          console.log(`🔍 Sample messageIds in DB (first 10):`);
          sampleResult.Items.forEach((item, idx) => {
            const msgId = item.messageId?.S || 'MISSING';
            const matches = msgId.includes('CAF5CD5F9koKTTu') ? ' ⭐ MATCHES' : '';
            console.log(`  ${idx + 1}. "${msgId.substring(0, 80)}${msgId.length > 80 ? '...' : ''}"${matches}`);
          });
        }
      } catch (broadError) {
        console.warn('Could not perform sample scan:', broadError);
      }

      console.error(`❌ Email not found with any variant. Tried: ${uniqueVariations.join(', ')}`);
      return NextResponse.json(
        { error: 'Email not found', messageId, triedVariations: uniqueVariations.slice(0, 10) },
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
      console.log(`✅ Neo4j updated successfully for ${foundMessageId}`);
    } catch (neo4jError) {
      console.error('⚠️ Failed to update Neo4j (continuing anyway):', neo4jError);
      // Don't fail the request if Neo4j update fails
    }

    console.log(`✅ Email allowed successfully: ${foundMessageId}`);

    return NextResponse.json({
      success: true,
      messageId: foundMessageId,
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

