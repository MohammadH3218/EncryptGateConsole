// scripts/fix-orphaned-detections.ts
// Script to fix emails that have detections but weren't properly updated

import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { ddb, TABLES } from '../lib/aws';

const EMAILS_TABLE = TABLES.EMAILS;
const DETECTIONS_TABLE = TABLES.DETECTIONS;

async function fixOrphanedDetections() {
  console.log('🔍 Scanning for orphaned detections...');

  // Get all detections
  const detectionsScan = new ScanCommand({
    TableName: DETECTIONS_TABLE,
  });

  const detectionsResult = await ddb.send(detectionsScan);
  const detections = detectionsResult.Items || [];

  console.log(`📊 Found ${detections.length} detections`);

  // For each detection, find and update the corresponding email
  for (const detection of detections) {
    const detectionId = detection.detectionId?.S;
    const emailMessageId = detection.emailMessageId?.S;
    const severity = detection.severity?.S;
    const threatScore = detection.threatScore?.N;

    if (!detectionId || !emailMessageId) {
      console.warn(`⚠️ Skipping detection with missing fields:`, { detectionId, emailMessageId });
      continue;
    }

    console.log(`\n🔍 Processing detection ${detectionId} for email ${emailMessageId.substring(0, 50)}...`);

    // Find the email by messageId (try multiple variations)
    const messageIdVariations = [
      emailMessageId,
      emailMessageId.replace(/^<|>$/g, ''), // Remove angle brackets
      emailMessageId.replace(/\+/g, '_'), // Replace + with _
      emailMessageId.replace(/_/g, '+'), // Replace _ with +
    ];

    let emailFound = false;

    for (const msgId of messageIdVariations) {
      const emailScan = new ScanCommand({
        TableName: EMAILS_TABLE,
        FilterExpression: 'messageId = :messageId',
        ExpressionAttributeValues: {
          ':messageId': { S: msgId },
        },
        Limit: 1,
      });

      const emailResult = await ddb.send(emailScan);
      const emails = emailResult.Items || [];

      if (emails.length > 0) {
        const email = emails[0];
        const emailFlaggedCategory = email.flaggedCategory?.S;
        const emailDetectionId = email.detectionId?.S;

        // Check if email needs updating
        if (emailFlaggedCategory !== 'ai' || emailDetectionId !== detectionId) {
          console.log(`  📧 Found email that needs updating:`);
          console.log(`     Current flaggedCategory: ${emailFlaggedCategory || 'none'}`);
          console.log(`     Current detectionId: ${emailDetectionId || 'none'}`);
          console.log(`     Should be: flaggedCategory=ai, detectionId=${detectionId}`);

          // Update the email
          const updateExpressions: string[] = [
            'flaggedCategory = :flaggedCategory',
            'detectionId = :detectionId',
            'investigationStatus = :investigationStatus',
            'updatedAt = :updatedAt',
          ];

          const expressionValues: Record<string, any> = {
            ':flaggedCategory': { S: 'ai' },
            ':detectionId': { S: detectionId },
            ':investigationStatus': { S: 'new' },
            ':updatedAt': { S: new Date().toISOString() },
          };

          if (severity) {
            updateExpressions.push('flaggedSeverity = :flaggedSeverity');
            updateExpressions.push('threatLevel = :threatLevel');
            expressionValues[':flaggedSeverity'] = { S: severity };
            expressionValues[':threatLevel'] = { S: severity };
          }

          if (threatScore) {
            updateExpressions.push('threatScore = :threatScore');
            expressionValues[':threatScore'] = { N: threatScore };
          }

          // Add flaggedAt timestamp
          updateExpressions.push('flaggedAt = :flaggedAt');
          expressionValues[':flaggedAt'] = { S: new Date().toISOString() };

          const updateCommand = new UpdateItemCommand({
            TableName: EMAILS_TABLE,
            Key: {
              userId: email.userId!,
              receivedAt: email.receivedAt!,
            },
            UpdateExpression: `SET ${updateExpressions.join(', ')}`,
            ExpressionAttributeValues: expressionValues,
          });

          await ddb.send(updateCommand);
          console.log(`  ✅ Email updated successfully!`);
          emailFound = true;
          break;
        } else {
          console.log(`  ✅ Email already correctly updated`);
          emailFound = true;
          break;
        }
      }
    }

    if (!emailFound) {
      console.warn(`  ⚠️ Could not find email for detection ${detectionId}`);
    }
  }

  console.log('\n✅ Finished fixing orphaned detections');
}

// Run the script
fixOrphanedDetections()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

