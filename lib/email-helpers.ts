// lib/email-helpers.ts - Internal email update functions
import { ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { ddb } from './aws';

const EMAILS_TABLE = process.env.EMAILS_TABLE_NAME || 'Emails';

// Helper function to normalize messageId (remove angle brackets if present)
function normalizeMessageId(messageId: string): string {
  return messageId.replace(/^<|>$/g, '');
}

// Helper function to try multiple messageId variations (handles encoding issues)
function getMessageIdVariations(messageId: string): string[] {
  const variations: string[] = [messageId];
  
  // Try with spaces replaced by underscores (common encoding issue)
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

// Helper function to find email by messageId (tries multiple variations)
export async function findEmailByMessageId(messageId: string): Promise<{userId: string, receivedAt: string} | null> {
  try {
    console.log('🔍 Finding email by messageId:', messageId);
    
    // Get all variations to try (handles encoding issues and angle brackets)
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
    
    // Try each variation until we find a match
    for (const variant of uniqueVariations) {
      try {
        const scanCommand = new ScanCommand({
          TableName: EMAILS_TABLE,
          FilterExpression: 'messageId = :messageId',
          ExpressionAttributeValues: {
            ':messageId': { S: variant }
          },
          ProjectionExpression: 'userId, receivedAt',
          Limit: 1
        });

        const result = await ddb.send(scanCommand);
        
        if (result.Items && result.Items.length > 0) {
          const item = result.Items[0];
          console.log('✅ Found email with messageId variant:', variant.substring(0, 50) + '...', {
            userId: item.userId?.S,
            receivedAt: item.receivedAt?.S
          });
          
          return {
            userId: item.userId?.S || '',
            receivedAt: item.receivedAt?.S || ''
          };
        }
      } catch (variantError) {
        // Continue to next variation
        console.warn(`⚠️ Error trying variant ${variant.substring(0, 50)}:`, variantError);
      }
    }
    
    console.log('❌ Email not found after trying', uniqueVariations.length, 'variations');
    return null;
  } catch (error) {
    console.error('❌ Error finding email by messageId:', error);
    return null;
  }
}

// Helper function to update email attributes directly
export async function updateEmailAttributes(
  messageId: string,
  attributes: {
    flaggedCategory?: 'none' | 'ai' | 'manual' | 'clean'
    flaggedSeverity?: 'critical' | 'high' | 'medium' | 'low'
    investigationStatus?: 'new' | 'in_progress' | 'resolved'
    detectionId?: string
    flaggedBy?: string
    investigationNotes?: string
  }
): Promise<boolean> {
  try {
    console.log('📧 Updating email attributes for:', messageId, attributes);
    
    // Find the email first
    const emailKey = await findEmailByMessageId(messageId);
    if (!emailKey) {
      console.warn('⚠️ Email not found for update:', messageId);
      return false;
    }

    // Build update expression dynamically
    const updateExpressions: string[] = [];
    const attributeValues: Record<string, any> = {};
    const attributeNames: Record<string, string> = {};

    if (attributes.flaggedCategory !== undefined) {
      updateExpressions.push('#flaggedCategory = :flaggedCategory');
      attributeNames['#flaggedCategory'] = 'flaggedCategory';
      attributeValues[':flaggedCategory'] = { S: attributes.flaggedCategory };

      // If unflagging (setting to 'none' or 'clean'), remove severity and detection ID
      if (attributes.flaggedCategory === 'none' || attributes.flaggedCategory === 'clean') {
        updateExpressions.push('#flaggedSeverity = :null');
        updateExpressions.push('#detectionId = :null');
        attributeNames['#flaggedSeverity'] = 'flaggedSeverity';
        attributeNames['#detectionId'] = 'detectionId';
        attributeValues[':null'] = { NULL: true };
      }
    }

    if (attributes.flaggedSeverity !== undefined && (attributes.flaggedCategory === 'ai' || attributes.flaggedCategory === 'manual')) {
      updateExpressions.push('#flaggedSeverity = :flaggedSeverity');
      attributeNames['#flaggedSeverity'] = 'flaggedSeverity';
      attributeValues[':flaggedSeverity'] = { S: attributes.flaggedSeverity };
    }

    if (attributes.investigationStatus !== undefined) {
      updateExpressions.push('#investigationStatus = :investigationStatus');
      attributeNames['#investigationStatus'] = 'investigationStatus';
      attributeValues[':investigationStatus'] = { S: attributes.investigationStatus };
    }

    if (attributes.detectionId !== undefined) {
      updateExpressions.push('#detectionId = :detectionId');
      attributeNames['#detectionId'] = 'detectionId';
      attributeValues[':detectionId'] = attributes.detectionId ? { S: attributes.detectionId } : { NULL: true };
    }

    if (attributes.flaggedBy !== undefined) {
      updateExpressions.push('#flaggedBy = :flaggedBy');
      attributeNames['#flaggedBy'] = 'flaggedBy';
      attributeValues[':flaggedBy'] = { S: attributes.flaggedBy };
    }

    if (attributes.investigationNotes !== undefined) {
      updateExpressions.push('#investigationNotes = :investigationNotes');
      attributeNames['#investigationNotes'] = 'investigationNotes';
      attributeValues[':investigationNotes'] = attributes.investigationNotes ? { S: attributes.investigationNotes } : { NULL: true };
    }

    // Always update the timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    attributeNames['#updatedAt'] = 'updatedAt';
    attributeValues[':updatedAt'] = { S: new Date().toISOString() };

    // Add flaggedAt timestamp if flagging, clear it if unflagging
    if (attributes.flaggedCategory === 'ai' || attributes.flaggedCategory === 'manual') {
      updateExpressions.push('#flaggedAt = :flaggedAt');
      attributeNames['#flaggedAt'] = 'flaggedAt';
      attributeValues[':flaggedAt'] = { S: new Date().toISOString() };
    } else if (attributes.flaggedCategory === 'none' || attributes.flaggedCategory === 'clean') {
      updateExpressions.push('#flaggedAt = :null');
      attributeNames['#flaggedAt'] = 'flaggedAt';
      if (!attributeValues[':null']) {
        attributeValues[':null'] = { NULL: true };
      }
    }

    const updateCommand = new UpdateItemCommand({
      TableName: EMAILS_TABLE,
      Key: {
        userId: { S: emailKey.userId },
        receivedAt: { S: emailKey.receivedAt }
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: attributeNames,
      ExpressionAttributeValues: attributeValues,
      ReturnValues: 'ALL_NEW'
    });

    await ddb.send(updateCommand);
    console.log('✅ Email attributes updated successfully');
    return true;

  } catch (error: any) {
    console.error('❌ Failed to update email attributes:', error);
    return false;
  }
}