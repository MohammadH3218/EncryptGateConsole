import { NextResponse } from 'next/server';
import { ScanCommand, UpdateItemCommand, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { ddb, TABLES, extractOrgId } from '@/lib/aws';
import { getDriver } from '@/lib/neo4j';

export const runtime = 'nodejs';

const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || 'CloudServices';

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
 * Helper function to get WorkMail configuration from DynamoDB
 */
async function getWorkMailConfig(orgId: string) {
  try {
    const resp = await ddb.send(
      new GetItemCommand({
        TableName: CS_TABLE,
        Key: {
          orgId: { S: orgId },
          serviceType: { S: 'aws-workmail' },
        },
      })
    );

    if (!resp.Item) {
      return null;
    }

    return {
      organizationId: resp.Item.organizationId?.S!,
      region: resp.Item.region?.S!,
      alias: resp.Item.alias?.S || '',
    };
  } catch (err) {
    console.error('❌ Error fetching WorkMail config:', err);
    return null;
  }
}

/**
 * POST /api/email/block
 * Block an email and its sender
 * messageId and sender should be passed in the request body
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messageId, sender, reason, orgId: bodyOrgId } = body;

    if (!messageId) {
      return NextResponse.json(
        { error: 'messageId is required in request body' },
        { status: 400 }
      );
    }

    // Extract orgId from request or body
    const orgId = bodyOrgId || extractOrgId(request) || 'default-org';

    console.log(`🚫 Blocking email: ${messageId}, sender: ${sender}, orgId: ${orgId}`);

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
    let emailKey: any = null;
    let foundMessageId = messageId;

    for (const variant of uniqueVariations) {
      try {
        const findEmailCommand = new ScanCommand({
          TableName: TABLES.EMAILS,
          FilterExpression: 'messageId = :messageId',
          ExpressionAttributeValues: {
            ':messageId': { S: variant }
          },
          ProjectionExpression: 'userId, receivedAt, timestamp, createdAt, messageId',
          Limit: 10  // Increase limit for debugging
        });

        const findResult = await ddb.send(findEmailCommand);

        if (findResult.Items && findResult.Items.length > 0) {
          emailKey = findResult.Items[0];
          foundMessageId = variant;
          console.log(`✅ Found email with messageId variant: ${variant}`);
          console.log(`📧 Stored messageId in DB: ${emailKey.messageId?.S}`);
          break;
        }
      } catch (scanError: any) {
        console.warn(`⚠️ Error scanning for variant ${variant}:`, scanError.message);
        continue;
      }
    }

    if (!emailKey) {
      // Try a broader scan to see what messageIds actually exist
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
      UpdateExpression: 'SET #blocked = :blocked, #blockedAt = :blockedAt, #blockedReason = :blockedReason, #status = :status, #flaggedCategory = :flaggedCategory, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#blocked': 'blocked',
        '#blockedAt': 'blockedAt',
        '#blockedReason': 'blockedReason',
        '#status': 'status',
        '#flaggedCategory': 'flaggedCategory',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':blocked': { BOOL: true },
        ':blockedAt': { S: new Date().toISOString() },
        ':blockedReason': { S: reason || 'Blocked from investigation' },
        ':status': { S: 'blocked' },
        ':flaggedCategory': { S: 'manual' },
        ':updatedAt': { S: new Date().toISOString() }
      }
    });

    await ddb.send(updateEmailCommand);

    // Update Neo4j - mark email as blocked
    try {
      const driver = await getDriver();
      const session = driver.session();

      const neo4jUpdateQuery = `
        MATCH (e:Email {messageId: $messageId})
        SET e.blocked = true,
            e.blockedAt = datetime($blockedAt),
            e.blockedReason = $reason,
            e.status = 'blocked',
            e.flaggedCategory = 'manual',
            e.updatedAt = datetime($updatedAt)
        RETURN e
      `;

      await session.run(neo4jUpdateQuery, {
        messageId: foundMessageId,
        blockedAt: new Date().toISOString(),
        reason: reason || 'Blocked from investigation',
        updatedAt: new Date().toISOString()
      });

      await session.close();
      console.log(`✅ Neo4j updated successfully for ${foundMessageId}`);
    } catch (neo4jError) {
      console.error('⚠️ Failed to update Neo4j (continuing anyway):', neo4jError);
    }

    // Add sender to BlockList if provided
    let blockListEntry = null;
    if (sender) {
      const now = new Date().toISOString();
      const blockListId = `block_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      try {
        // Check if sender is already blocked
        const checkBlocked = new ScanCommand({
          TableName: TABLES.BLOCK_LIST,
          FilterExpression: 'orgId = :orgId AND senderEmail = :senderEmail',
          ExpressionAttributeValues: {
            ':orgId': { S: orgId },
            ':senderEmail': { S: sender }
          },
          Limit: 1
        });

        const existingBlock = await ddb.send(checkBlocked);

        if (!existingBlock.Items || existingBlock.Items.length === 0) {
          // Add to BlockList
          const putBlockCommand = new PutItemCommand({
            TableName: TABLES.BLOCK_LIST,
            Item: {
              id: { S: blockListId },
              orgId: { S: orgId },
              senderEmail: { S: sender },
              blockedAt: { S: now },
              blockedBy: { S: 'investigation' },
              reason: { S: reason || 'Blocked from investigation' },
              messageId: { S: foundMessageId },
              status: { S: 'active' },
              createdAt: { S: now },
              updatedAt: { S: now }
            }
          });

          await ddb.send(putBlockCommand);
          blockListEntry = { id: blockListId, senderEmail: sender };
          console.log(`✅ Added sender ${sender} to BlockList`);
        } else {
          console.log(`ℹ️ Sender ${sender} is already in BlockList`);
          blockListEntry = { id: existingBlock.Items[0].id?.S, senderEmail: sender, alreadyExists: true };
        }

        // Try to block in WorkMail using AWS CLI (since there's no direct API)
        try {
          const workmailConfig = await getWorkMailConfig(orgId);
          if (workmailConfig) {
            console.log(`🔧 Attempting to block sender in WorkMail organization: ${workmailConfig.organizationId}`);
            
            // Note: WorkMail doesn't have a direct API to create email flow rules programmatically
            // The BlockList entry serves as the source of truth
            // You would need to:
            // 1. Create a Lambda function that reads from BlockList
            // 2. Configure WorkMail to use that Lambda for email flow rules
            // 3. Or manually create the rule in WorkMail console
            
            console.log(`ℹ️ WorkMail blocking requires manual setup or Lambda function. BlockList entry created for ${sender}`);
          } else {
            console.log(`ℹ️ No WorkMail configuration found for org ${orgId}. Skipping WorkMail block.`);
          }
        } catch (workmailError: any) {
          console.error('⚠️ Failed to process WorkMail blocking (continuing anyway):', workmailError.message);
          // Don't fail the request if WorkMail blocking fails
        }
      } catch (blockListError: any) {
        console.error('⚠️ Failed to add to BlockList (continuing anyway):', blockListError.message);
        // Don't fail the request if BlockList update fails
      }
    }

    console.log(`✅ Email blocked successfully: ${foundMessageId}`);

    return NextResponse.json({
      success: true,
      messageId: foundMessageId,
      sender,
      blocked: true,
      blockedAt: new Date().toISOString(),
      blockListEntry
    });

  } catch (err: any) {
    console.error('❌ Error blocking email:', err);
    return NextResponse.json(
      { error: 'Failed to block email', details: err.message },
      { status: 500 }
    );
  }
}

