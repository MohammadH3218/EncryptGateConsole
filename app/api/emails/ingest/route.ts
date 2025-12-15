import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ddb, extractOrgId, TABLES } from '@/lib/aws';
import { PutItemCommand } from '@aws-sdk/client-dynamodb';
import { getDriver } from '@/lib/neo4j';

export const runtime = 'nodejs';

// Validation schema
const EmailIngestSchema = z.object({
  messageId: z.string().min(1),
  from: z.string().email(),
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  subject: z.string(),
  body: z.string().optional(),
  htmlBody: z.string().optional(),
  headers: z.record(z.string()).optional(),
  attachments: z.array(z.object({
    filename: z.string(),
    contentType: z.string(),
    size: z.number(),
    s3Key: z.string().optional(),
  })).optional(),
  timestamp: z.string(),
  organizationId: z.string().optional(),
  rawS3Key: z.string().optional(),
});

/**
 * POST /api/emails/ingest
 * Entry point for email ingestion from SES/Lambda or test scripts
 */
export async function POST(request: Request) {
  try {
    const orgId = extractOrgId(request);
    const body = await request.json();

    // Validate request
    const validated = EmailIngestSchema.parse(body);
    const emailOrgId = validated.organizationId || orgId || 'default-org';

    console.log(`📧 Ingesting email: ${validated.messageId} for org: ${emailOrgId}`);

    // Store email in DynamoDB
    // Set initial flaggedCategory to 'clean' (will be updated after threat detection)
    const emailItem: Record<string, any> = {
      messageId: { S: validated.messageId },
      organizationId: { S: emailOrgId },
      emailId: { S: `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` },
      from: { S: validated.from },
      to: { SS: validated.to },
      subject: { S: validated.subject },
      body: { S: validated.body || '' },
      htmlBody: { S: validated.htmlBody || '' },
      timestamp: { S: validated.timestamp },
      createdAt: { S: new Date().toISOString() },
      flaggedCategory: { S: 'clean' }, // Set initial state to 'clean' (will be updated after analysis)
    };

    if (validated.cc && validated.cc.length > 0) {
      emailItem.cc = { SS: validated.cc };
    }

    if (validated.headers) {
      emailItem.headers = { S: JSON.stringify(validated.headers) };
    }

    if (validated.attachments && validated.attachments.length > 0) {
      emailItem.attachments = { S: JSON.stringify(validated.attachments) };
    }

    if (validated.rawS3Key) {
      emailItem.rawS3Key = { S: validated.rawS3Key };
    }

    const emailsTable = process.env.EMAILS_TABLE_NAME || 'Emails';
    await ddb.send(new PutItemCommand({
      TableName: emailsTable,
      Item: emailItem,
    }));

    console.log(`✅ Email stored: ${validated.messageId}`);

    // Run threat detection for ALL emails (ensures flaggedCategory is set)
    let detectionCreated = false;
    let detectionId: string | null = null;
    let threatScore = 0;
    let severity: string = 'low';
    let flaggedCategory: 'clean' | 'ai' | 'none' = 'none';

    try {
      console.log(`🔍 Running threat detection for email: ${validated.messageId}`);
      
      // Extract URLs from email body for VirusTotal scanning
      const emailBody = validated.body || validated.htmlBody || '';
      const extractedUrls = extractURLs(emailBody);
      console.log(`🔗 Extracted ${extractedUrls.length} URLs from email body`);
      
      const threatResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/threat-detection`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-org-id': emailOrgId, // Pass orgId in header for detection creation
        },
        body: JSON.stringify({
          messageId: validated.messageId,
          sender: validated.from,
          recipients: validated.to,
          subject: validated.subject,
          body: emailBody,
          timestamp: validated.timestamp,
          urls: extractedUrls, // Extract URLs for VirusTotal scanning
          direction: 'inbound',
          attachments: validated.attachments?.map(att => ({
            filename: att.filename,
            mimeType: att.contentType,
            s3Key: att.s3Key,
          })) || [],
        }),
      });

      if (threatResponse.ok) {
        const threatData = await threatResponse.json();
        const analysis = threatData.analysis || threatData;

        threatScore = analysis.threatScore || 0;
        severity = analysis.threatLevel || 'low';
        
        // Determine flaggedCategory based on threat analysis
        // Only flag medium, high, or critical threats to reduce false positives
        if (analysis.threatLevel === 'none' || analysis.threatLevel === 'low') {
          flaggedCategory = 'clean';
        } else if (analysis.threatLevel === 'medium' || analysis.threatLevel === 'high' || analysis.threatLevel === 'critical') {
          flaggedCategory = 'ai';
        }

        console.log(`✅ Threat detection completed: ${validated.messageId} - Level: ${severity}, Score: ${threatScore}, Flagged: ${flaggedCategory}`);

        // Create detection if threat found (only for medium+ threats)
        if (analysis.threatLevel === 'medium' || analysis.threatLevel === 'high' || analysis.threatLevel === 'critical') {
          detectionId = `det-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          const timestamp = new Date().toISOString();
          const detectionItem: Record<string, any> = {
            detectionId: { S: detectionId },
            receivedAt: { S: timestamp }, // Add receivedAt for proper table structure
            orgId: { S: emailOrgId }, // Use orgId for consistency
            organizationId: { S: emailOrgId }, // Keep both for compatibility
            emailMessageId: { S: validated.messageId },
            severity: { S: severity },
            status: { S: 'new' },
            name: { S: validated.subject },
            description: { S: analysis.reasoning || 'Threat detected' },
            sentBy: { S: validated.from },
            assignedTo: { S: JSON.stringify([]) },
            indicators: { S: JSON.stringify(analysis.indicators || []) },
            recommendations: { S: JSON.stringify(analysis.recommendations || []) },
            threatScore: { N: threatScore.toString() },
            confidence: { N: (analysis.confidence || 50).toString() },
            createdAt: { S: timestamp },
            timestamp: { S: validated.timestamp },
            manualFlag: { BOOL: false },
          };

          const detectionsTable = process.env.DETECTIONS_TABLE_NAME || TABLES.DETECTIONS || 'Detections';
          await ddb.send(new PutItemCommand({
            TableName: detectionsTable,
            Item: detectionItem,
          }));

          detectionCreated = true;
          console.log(`🚨 Detection created: ${detectionId} (${severity})`);
        }
      } else {
        const errorText = await threatResponse.text();
        console.warn(`⚠️ Threat detection returned status ${threatResponse.status}: ${errorText}`);
      }
    } catch (threatError: any) {
      console.error('❌ Threat detection failed:', threatError.message);
      // Continue without detection - email is still stored
    }

        // Update Neo4j graph directly
    try {
      const driver = await getDriver();
      const session = driver.session();
      const urls = extractURLs(validated.body || validated.htmlBody || '');
      await session.run(
        `
        MERGE (sender:User {email:$sender, orgId:$orgId})
        MERGE (domain:Domain {name: split($sender,'@')[1], orgId:$orgId})
        MERGE (sender)-[:FROM_DOMAIN]->(domain)
        MERGE (email:Email {messageId:$messageId, orgId:$orgId})
          SET email.subject = $subject,
              email.sentAt = datetime($timestamp),
              email.severity = $severity,
              email.riskScore = $threatScore
        MERGE (sender)-[:WAS_SENT]->(email)
        WITH email
        UNWIND $recipients AS rcpt
          MERGE (r:User {email:rcpt, orgId:$orgId})
          MERGE (email)-[:WAS_SENT_TO]->(r)
        WITH email
        UNWIND $urls AS urlVal
          MERGE (u:URL {url: urlVal})
          ON CREATE SET u.createdAt = datetime()
          MERGE (email)-[:CONTAINS_URL]->(u)
        RETURN email
        `,
        {
          sender: validated.from,
          orgId: emailOrgId,
          messageId: validated.messageId,
          subject: validated.subject,
          timestamp: validated.timestamp,
          recipients: validated.to,
          urls,
          severity,
          threatScore,
        }
      );
      await session.close();
      console.log(`Email added to Neo4j graph: ${validated.messageId}`);
    } catch (graphError: any) {
      console.warn('Neo4j graph update failed:', graphError.message);
    }
    return NextResponse.json({
      success: true,
      emailId: validated.messageId,
      detectionCreated,
      detectionId,
      threatScore,
      severity,
    });
  } catch (error: any) {
    console.error('❌ Email ingestion failed:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to ingest email', details: error.message },
      { status: 500 }
    );
  }
}

// Helper function to extract URLs from text
function extractURLs(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const matches = text.match(urlRegex) || [];
  return [...new Set(matches)]; // Remove duplicates
}

