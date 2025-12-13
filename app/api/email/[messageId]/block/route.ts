import { NextResponse } from 'next/server';
import { ScanCommand, UpdateItemCommand, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { ddb, TABLES, extractOrgId } from '@/lib/aws';
import { getDriver } from '@/lib/neo4j';

export const runtime = 'nodejs';

const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || 'CloudServices';

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
    const { sender, reason, orgId: bodyOrgId } = body;

    // Extract orgId from request or body
    const orgId = bodyOrgId || extractOrgId(request) || 'default-org';

    console.log(`🚫 Blocking email: ${messageId}, sender: ${sender}, orgId: ${orgId}`);

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
        messageId,
        blockedAt: new Date().toISOString(),
        reason: reason || 'Blocked from investigation',
        updatedAt: new Date().toISOString()
      });

      await session.close();
      console.log(`✅ Neo4j updated successfully for ${messageId}`);
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
              messageId: { S: messageId },
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

    console.log(`✅ Email blocked successfully: ${messageId}`);

    return NextResponse.json({
      success: true,
      messageId,
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

