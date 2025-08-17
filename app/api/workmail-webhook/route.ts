export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  GetItemCommand
} from '@aws-sdk/client-dynamodb'
import { z } from 'zod'

const ORG_ID          = process.env.ORGANIZATION_ID      || 'default-org'
const CS_TABLE        = process.env.CLOUDSERVICES_TABLE  || 'CloudServices'
const EMPLOYEES_TABLE = process.env.EMPLOYEES_TABLE_NAME || 'Employees'
const EMAILS_TABLE    = process.env.EMAILS_TABLE_NAME    || 'Emails'
const BASE_URL        = process.env.BASE_URL             || 'https://console-encryptgate.net'
const AWS_REGION      = process.env.AWS_REGION           || 'us-east-1'

console.log('📧 Pure WorkMail Webhook initialized (NO SES):', {
  ORG_ID,
  CS_TABLE,
  EMPLOYEES_TABLE,
  EMAILS_TABLE,
  BASE_URL,
  AWS_REGION
})

const ddb = new DynamoDBClient({ region: AWS_REGION })

// Pure WorkMail Message Flow schema (NO SES)
const WorkMailMessageFlowSchema = z.object({
  messageId: z.string(),
  flowDirection: z.enum(['INBOUND', 'OUTBOUND']).optional(),
  orgId: z.string().optional(),
  summaryVersion: z.string().optional(),
  envelope: z.object({
    mailFrom: z.string().optional(),
    recipients: z.array(z.string()).optional()
  }).optional(),
  subject: z.string().optional(),
  timestamp: z.string().optional(),
  raw: z.object({
    base64: z.string()
  }).optional(),
  extractedBody: z.string().optional(),
  processingInfo: z.object({
    version: z.string(),
    extractionMethod: z.string(),
    requestId: z.string()
  }).optional()
})

async function isMonitoredEmployee(email: string): Promise<boolean> {
  try {
    console.log(`🔍 Checking if ${email} is monitored...`)
    
    const resp = await ddb.send(new GetItemCommand({
      TableName: EMPLOYEES_TABLE,
      Key: {
        orgId: { S: ORG_ID },
        email: { S: email }
      }
    }))
    
    const isMonitored = Boolean(resp.Item)
    console.log(`${isMonitored ? '✅' : '❌'} ${email} is ${isMonitored ? '' : 'not '}monitored`)
    
    return isMonitored
  } catch (err) {
    console.error('❌ Error checking monitored employee:', err)
    return false
  }
}

function parseEmailBodyFromBase64(base64Content: string): { 
  body: string; 
  bodyHtml?: string; 
  headers: Record<string, string>;
  subject?: string;
  sender?: string;
  recipients?: string[];
} {
  try {
    console.log('📧 Parsing email from base64 content');
    
    const rawContent = Buffer.from(base64Content, 'base64').toString('utf-8');
    console.log('📧 Raw content length:', rawContent.length);
    
    const lines = rawContent.split('\n');
    const headers: Record<string, string> = {};
    let headerEndIndex = -1;
    
    // Parse headers
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '' || line === '\r') {
        headerEndIndex = i;
        break;
      }
      
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).toLowerCase().trim();
        const value = line.substring(colonIndex + 1).trim();
        headers[key] = value;
      }
    }
    
    console.log('📧 Parsed headers:', Object.keys(headers));
    
    // Get body content
    let body = '';
    if (headerEndIndex >= 0) {
      body = lines.slice(headerEndIndex + 1).join('\n').trim();
    }
    
    console.log('📧 Extracted body length:', body.length);
    console.log('📧 Body preview:', body.substring(0, 200));
    
    // Extract email details from headers
    const subject = headers['subject'] || 'No Subject';
    const sender = extractEmailAddress(headers['from'] || '');
    const recipients = extractEmailAddresses(headers['to'] || '');
    
    return {
      body: body || 'No message content available',
      headers,
      subject,
      sender,
      recipients
    };
    
  } catch (error) {
    console.error('❌ Error parsing base64 content:', error);
    return {
      body: 'Error parsing email content',
      headers: {},
      subject: 'Parsing Error',
      sender: 'unknown@email.com',
      recipients: ['unknown@email.com']
    };
  }
}

function extractEmailAddress(header: string): string {
  if (!header) return 'unknown@email.com';
  const match = header.match(/<([^>]+)>/);
  const result = match ? match[1] : header.trim();
  return result.includes('@') ? result : 'unknown@email.com';
}

function extractEmailAddresses(header: string): string[] {
  if (!header) return ['unknown@email.com'];
  const emails = header.split(',').map(email => extractEmailAddress(email.trim()));
  const validEmails = emails.filter(email => email.includes('@'));
  return validEmails.length > 0 ? validEmails : ['unknown@email.com'];
}

function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi
  const urls = text.match(re) || []
  console.log(`🔗 Found ${urls.length} URLs in message`)
  return urls
}

function containsSuspiciousKeywords(body: string): boolean {
  const suspicious = [
    'urgent', 'verify account',
    'immediate action', 'suspended',
    'click here', 'confirm identity',
    'prize', 'winner', 'limited time'
  ]
  const lower = body.toLowerCase()
  const found = suspicious.filter(k => lower.includes(k))
  if (found.length > 0) {
    console.log(`⚠️ Found suspicious keywords: ${found.join(', ')}`)
  }
  return found.length > 0
}

export async function POST(req: Request) {
  try {
    console.log('📥 Pure WorkMail webhook received (NO SES)')
    const raw = await req.json()
    
    console.log('🔍 Raw webhook data:', {
      hasMessageId: !!raw?.messageId,
      hasFlowDirection: !!raw?.flowDirection,
      hasRaw: !!raw?.raw?.base64,
      hasExtractedBody: !!raw?.extractedBody,
      processingVersion: raw?.processingInfo?.version,
      hasRecords: !!raw?.Records // Should be false for pure WorkMail
    });

    // REJECT any SES events completely
    if (raw?.Records?.[0]?.eventSource === 'aws:ses') {
      console.log('🚫 REJECTED: SES event detected - only WorkMail Message Flow events allowed');
      return NextResponse.json({
        status: 'rejected',
        reason: 'ses_events_not_supported',
        message: 'Only WorkMail Message Flow events are supported. Please configure WorkMail Message Flow instead of SES.'
      }, { status: 400 });
    }

    try {
      const event = WorkMailMessageFlowSchema.parse(raw)
      console.log('✅ WorkMail Message Flow schema validation passed')
      
      const messageId = event.messageId;
      console.log('📧 Processing WorkMail message:', messageId);
      
      // Skip outbound messages for now (optional)
      if (event.flowDirection === 'OUTBOUND') {
        console.log('🚫 Skipping OUTBOUND message');
        return NextResponse.json({
          status: 'skipped',
          reason: 'outbound_message',
          messageId
        });
      }
      
      // Parse email content from raw data
      let emailData: any = {
        messageId,
        body: '',
        headers: {},
        subject: 'No Subject',
        sender: 'unknown@email.com',
        recipients: ['unknown@email.com']
      };
      
      if (event.raw?.base64) {
        console.log('📧 Parsing email from Lambda-provided raw content');
        const parsed = parseEmailBodyFromBase64(event.raw.base64);
        emailData = {
          messageId,
          body: parsed.body,
          bodyHtml: parsed.bodyHtml,
          headers: parsed.headers,
          subject: parsed.subject || event.subject || 'No Subject',
          sender: parsed.sender || 'unknown@email.com',
          recipients: parsed.recipients || ['unknown@email.com']
        };
      } else if (event.extractedBody) {
        console.log('📧 Using extracted body from Lambda');
        emailData.body = event.extractedBody;
        emailData.subject = event.subject || 'No Subject';
        
        // Try to get sender/recipients from envelope
        if (event.envelope) {
          emailData.sender = event.envelope.mailFrom || 'unknown@email.com';
          emailData.recipients = event.envelope.recipients || ['unknown@email.com'];
        }
      } else {
        console.warn('⚠️ No usable email content in WorkMail event');
        emailData.body = 'No email content available from WorkMail Message Flow';
      }
      
      console.log('📧 Email data extracted:', {
        messageId: emailData.messageId,
        subject: emailData.subject,
        sender: emailData.sender,
        recipients: emailData.recipients,
        bodyLength: emailData.body?.length || 0,
        bodyPreview: emailData.body?.substring(0, 150) || 'NO BODY',
        hasRealContent: emailData.body && emailData.body.length > 0 && !emailData.body.includes('No email content available')
      });
      
      // Check if sender or recipients are monitored
      const senderMonitored = await isMonitoredEmployee(emailData.sender);
      const recipientsMonitored = await Promise.all(
        emailData.recipients.map(isMonitoredEmployee)
      );
      
      const hasMonitoredParticipant = senderMonitored || recipientsMonitored.some(Boolean);
      
      if (!hasMonitoredParticipant) {
        console.log('ℹ️ No monitored participants, skipping');
        return NextResponse.json({
          status: 'skipped',
          reason: 'no-monitored-users',
          participants: { 
            sender: emailData.sender, 
            recipients: emailData.recipients 
          }
        });
      }
      
      // Determine userId based on monitoring
      const userId = senderMonitored 
        ? emailData.sender 
        : emailData.recipients[recipientsMonitored.findIndex(Boolean)] || emailData.recipients[0];
      
      console.log('👤 Using userId:', userId);
      
      // Analyze content
      const urls = extractUrls(emailData.body);
      const hasThreat = urls.length > 0 || containsSuspiciousKeywords(emailData.body);
      
      // Prepare email item for storage
      const emailItem = {
        messageId: emailData.messageId,
        sender: emailData.sender,
        recipients: emailData.recipients,
        subject: emailData.subject,
        timestamp: event.timestamp || new Date().toISOString(),
        body: emailData.body,
        bodyHtml: emailData.bodyHtml || emailData.body,
        headers: emailData.headers,
        attachments: [] as string[],
        direction: senderMonitored ? 'outbound' : 'inbound',
        size: emailData.body?.length || 0,
        urls,
        hasThreat
      };
      
      console.log('📧 Final email item for storage:', {
        messageId: emailItem.messageId,
        bodyLength: emailItem.body.length,
        direction: emailItem.direction,
        hasRealContent: emailItem.body.length > 0 && !emailItem.body.includes('No email content available')
      });
      
      // Store in DynamoDB
      try {
        console.log(`💾 Writing email to DynamoDB table ${EMAILS_TABLE}`);
        
        const dbItem: Record<string, any> = {
          userId: { S: userId },
          receivedAt: { S: emailItem.timestamp },
          messageId: { S: emailItem.messageId },
          emailId: { S: `email-${Date.now()}-${Math.random().toString(36).slice(2,8)}` },
          sender: { S: emailItem.sender || '' },
          subject: { S: emailItem.subject || 'No Subject' },
          body: { S: emailItem.body || '' },
          bodyHtml: { S: emailItem.bodyHtml || '' },
          direction: { S: emailItem.direction },
          size: { N: String(emailItem.size || 0) },
          status: { S: 'received' },
          threatLevel: { S: 'none' },
          isPhishing: { BOOL: false },
          createdAt: { S: new Date().toISOString() },
          
          // Email attributes
          flaggedCategory: { S: 'none' },
          updatedAt: { S: new Date().toISOString() }
        };

        if (emailItem.recipients?.length) dbItem.recipients = { SS: emailItem.recipients };
        if (emailItem.attachments?.length) dbItem.attachments = { SS: emailItem.attachments };
        if (emailItem.urls?.length) dbItem.urls = { SS: emailItem.urls };
        if (emailItem.headers && Object.keys(emailItem.headers).length) {
          dbItem.headers = { S: JSON.stringify(emailItem.headers) };
        }

        await ddb.send(new PutItemCommand({
          TableName: EMAILS_TABLE,
          Item: dbItem,
          ConditionExpression: 'attribute_not_exists(messageId)'
        }));
        
        console.log('✅ Email stored successfully in DynamoDB');
        
      } catch(err: any) {
        if (err.name === 'ConditionalCheckFailedException') {
          console.log('ℹ️ Email already exists, skipping duplicate:', emailItem.messageId);
          return NextResponse.json({
            status: 'duplicate_skipped',
            reason: 'email_already_exists',
            messageId: emailItem.messageId
          });
        } else {
          console.error('❌ DynamoDB write failed', err);
          throw err;
        }
      }

      // Trigger threat detection if needed
      if (hasThreat) {
        try {
          await fetch(`${BASE_URL}/api/threat-detection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emailItem)
          });
        } catch (threatErr) {
          console.warn('⚠️ Threat detection call failed:', threatErr);
        }
      }

      // Update graph
      try {
        await fetch(`${BASE_URL}/api/graph`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add_email', data: emailItem })
        });
      } catch (graphErr) {
        console.warn('⚠️ Graph update call failed:', graphErr);
      }

      console.log('🎉 Pure WorkMail email processing complete');
      return NextResponse.json({
        status: 'processed',
        messageId: emailItem.messageId,
        direction: emailItem.direction,
        threatsTriggered: hasThreat,
        webhookType: 'Pure-WorkMail-Message-Flow',
        userId: userId,
        bodyLength: emailItem.body.length,
        hasRealContent: emailItem.body.length > 0 && !emailItem.body.includes('No email content available'),
        processingMethod: 'workmail-pure'
      });
      
    } catch (schemaError: any) {
      console.error('❌ Schema validation failed:', schemaError.message);
      return NextResponse.json(
        { 
          error: 'Invalid WorkMail Message Flow event format', 
          details: schemaError.message,
          message: 'Only WorkMail Message Flow events are supported. SES events are rejected.'
        },
        { status: 400 }
      );
    }

  } catch(err: any) {
    console.error('❌ Webhook processing failed:', err);
    return NextResponse.json(
      { 
        error: 'Webhook processing failed', 
        message: err.message,
        stack: err.stack?.split('\n').slice(0, 3)
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  console.log('🏥 Health check - Pure WorkMail Webhook (NO SES)');
  try {
    await ddb.send(new QueryCommand({
      TableName: CS_TABLE,
      KeyConditionExpression: 'orgId = :orgId',
      ExpressionAttributeValues: { ':orgId': { S: ORG_ID } },
      Limit: 1
    }));
    
    return NextResponse.json({ 
      status: 'webhook_ready',
      version: 'workmail-pure-v1.0',
      processingMethod: 'workmail-message-flow-only',
      sesSupport: false,
      features: [
        'workmail-message-flow-api-only',
        'direct-mime-parsing',
        'real-email-body-extraction',
        'no-ses-dependencies',
        'rejects-ses-events'
      ],
      message: 'Pure WorkMail webhook ready - SES events are rejected'
    });
  } catch(err) {
    console.error('❌ Health check failed', err);
    return NextResponse.json({ status: 'unhealthy' }, { status: 500 });
  }
}