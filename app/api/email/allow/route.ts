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
          Limit: 50  // Increased to find the specific email
        });
        const sampleResult = await ddb.send(sampleScan);
        if (sampleResult.Items && sampleResult.Items.length > 0) {
          console.log(`🔍 Sample messageIds in DB (first 50):`);
          let foundMatch = false;
          sampleResult.Items.forEach((item, idx) => {
            const msgId = item.messageId?.S || 'MISSING';
            const matches = msgId.includes('CAF5CD5F9koKTTu') ? ' ⭐ MATCHES!' : '';
            if (msgId.includes('CAF5CD5F9koKTTu')) foundMatch = true;
            console.log(`  ${idx + 1}. "${msgId}"${matches}`);
          });
          if (!foundMatch) {
            console.log(`⚠️ Email with messageId containing 'CAF5CD5F9koKTTu' not found in sample`);
            console.log(`ℹ️ This email might only exist in Neo4j, not DynamoDB`);
          }
        }
      } catch (broadError) {
        console.warn('Could not perform sample scan:', broadError);
      }

      // If email exists in Neo4j but not DynamoDB, we can still update Neo4j
      console.log(`⚠️ Email not found in DynamoDB, checking if it exists in Neo4j...`);
      try {
        const driver = await getDriver();
        const session = driver.session();
        
        // Try all variations in Neo4j
        let neo4jEmailFound = false;
        let neo4jMessageId = uniqueVariations[0];
        
        for (const variant of uniqueVariations) {
          try {
            const neo4jCheckQuery = `MATCH (e:Email {messageId: $messageId}) RETURN e LIMIT 1`;
            const neo4jResult = await session.run(neo4jCheckQuery, { messageId: variant });
            
            if (neo4jResult.records.length > 0) {
              neo4jEmailFound = true;
              neo4jMessageId = variant;
              console.log(`✅ Email found in Neo4j with messageId variant: ${variant}`);
              break;
            }
          } catch (checkError) {
            console.warn(`⚠️ Error checking Neo4j variant ${variant}:`, checkError);
            continue;
          }
        }
        
        if (neo4jEmailFound) {
          console.log(`✅ Email found in Neo4j but not in DynamoDB - will get info from Neo4j and create/update DynamoDB`);
          
          try {
            // Get email details from Neo4j including sender and recipient
            const neo4jGetQuery = `
              MATCH (sender:User)-[:WAS_SENT]->(e:Email {messageId: $messageId})
              OPTIONAL MATCH (e)-[:WAS_SENT_TO]->(recipient:User)
              RETURN e, sender.email AS senderEmail, collect(recipient.email) AS recipientEmails
              LIMIT 1
            `;
            
            const neo4jGetResult = await session.run(neo4jGetQuery, { messageId: neo4jMessageId });
            
            if (neo4jGetResult.records.length > 0) {
              const record = neo4jGetResult.records[0];
              const emailNode = record.get('e').properties;
              const senderEmail = record.get('senderEmail');
              const recipientEmails = record.get('recipientEmails') || [];
              
              // Get sentDate from email node (could be sentDate, sentAt, or timestamp)
              const sentDate = emailNode.sentDate || emailNode.sentAt || emailNode.timestamp || new Date().toISOString();
              
              // Determine userId: for inbound emails, use first recipient; for outbound, use sender
              // Default to first recipient if available, otherwise sender
              const userId = recipientEmails.length > 0 ? recipientEmails[0] : senderEmail;
              
              console.log(`📧 Got email info from Neo4j: userId=${userId}, receivedAt=${sentDate}, sender=${senderEmail}`);
              
              // Try to create or update email in DynamoDB
              try {
                const updateEmailCommand = new UpdateItemCommand({
                  TableName: TABLES.EMAILS,
                  Key: {
                    userId: { S: userId },
                    receivedAt: { S: sentDate }
                  },
                  UpdateExpression: 'SET #allowed = :allowed, #allowedAt = :allowedAt, #allowedReason = :allowedReason, #status = :status, #flaggedCategory = :flaggedCategory, #flaggedStatus = :flaggedStatus, #messageId = :messageId, #sender = :sender, #subject = :subject, #updatedAt = :updatedAt',
                  ExpressionAttributeNames: {
                    '#allowed': 'allowed',
                    '#allowedAt': 'allowedAt',
                    '#allowedReason': 'allowedReason',
                    '#status': 'status',
                    '#flaggedCategory': 'flaggedCategory',
                    '#flaggedStatus': 'flaggedStatus',
                    '#messageId': 'messageId',
                    '#sender': 'sender',
                    '#subject': 'subject',
                    '#updatedAt': 'updatedAt'
                  },
                  ExpressionAttributeValues: {
                    ':allowed': { BOOL: true },
                    ':allowedAt': { S: new Date().toISOString() },
                    ':allowedReason': { S: reason || 'Allowed from investigation - marked as clean' },
                    ':status': { S: 'clean' },
                    ':flaggedCategory': { S: 'clean' },
                    ':flaggedStatus': { S: 'clean' },
                    ':messageId': { S: neo4jMessageId },
                    ':sender': { S: senderEmail || '' },
                    ':subject': { S: emailNode.subject || 'No Subject' },
                    ':updatedAt': { S: new Date().toISOString() }
                  }
                });
                
                await ddb.send(updateEmailCommand);
                console.log(`✅ Email created/updated in DynamoDB`);
              } catch (dynamoError: any) {
                console.warn(`⚠️ Failed to create/update email in DynamoDB:`, dynamoError.message);
                // Continue to update Neo4j anyway
              }
              
              // Update Neo4j
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
                messageId: neo4jMessageId,
                allowedAt: new Date().toISOString(),
                reason: reason || 'Allowed from investigation - marked as clean',
                updatedAt: new Date().toISOString()
              });

              await session.close();
              console.log(`✅ Neo4j updated successfully`);

              return NextResponse.json({
                success: true,
                messageId: neo4jMessageId,
                allowed: true,
                status: 'clean',
                flaggedCategory: 'clean',
                flaggedStatus: 'clean',
                allowedAt: new Date().toISOString()
              });
            } else {
              await session.close();
              throw new Error('Could not get email details from Neo4j');
            }
          } catch (neo4jUpdateError) {
            await session.close();
            console.error('❌ Failed to update Neo4j:', neo4jUpdateError);
            throw neo4jUpdateError;
          }
        } else {
          await session.close();
          console.log(`❌ Email not found in Neo4j either`);
        }
      } catch (neo4jCheckError) {
        console.warn('Could not check Neo4j:', neo4jCheckError);
      }

      console.error(`❌ Email not found with any variant in DynamoDB. Tried: ${uniqueVariations.slice(0, 5).join(', ')}...`);
      return NextResponse.json(
        { error: 'Email not found in DynamoDB', messageId, triedVariations: uniqueVariations.slice(0, 10) },
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

