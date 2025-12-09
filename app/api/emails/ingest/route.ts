import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ddb, extractOrgId, TABLES } from '@/lib/aws';
import { PutItemCommand } from '@aws-sdk/client-dynamodb';

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

    // Run threat detection
    let detectionCreated = false;
    let detectionId: string | null = null;
    let threatScore = 0;
    let severity: string = 'low';

    try {
      const threatResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/threat-detection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: validated.messageId,
          subject: validated.subject,
          from: validated.from,
          body: validated.body || '',
          headers: validated.headers || {},
        }),
      });

      if (threatResponse.ok) {
        const threatData = await threatResponse.json();
        const analysis = threatData.analysis || threatData;

        threatScore = analysis.threatScore || 0;
        severity = analysis.threatLevel || 'low';

        // Create detection if threat found
        if (analysis.threatLevel !== 'none' && threatScore > 30) {
          detectionId = `det-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          const detectionItem: Record<string, any> = {
            detectionId: { S: detectionId },
            organizationId: { S: emailOrgId },
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
            createdAt: { S: new Date().toISOString() },
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
      }
    } catch (threatError: any) {
      console.warn('⚠️ Threat detection failed, continuing without detection:', threatError.message);
    }

    // Update Neo4j graph
    try {
      const graphResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/graph/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_email',
          data: {
            messageId: validated.messageId,
            sender: validated.from,
            recipients: validated.to,
            subject: validated.subject,
            body: validated.body || '',
            timestamp: validated.timestamp,
            urls: extractURLs(validated.body || ''),
          },
        }),
      });

      if (graphResponse.ok) {
        console.log(`✅ Email added to Neo4j graph: ${validated.messageId}`);
      }
    } catch (graphError: any) {
      console.warn('⚠️ Neo4j graph update failed:', graphError.message);
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

