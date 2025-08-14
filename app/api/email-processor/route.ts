// app/api/email-processor/route.ts - UPDATED to set default email attributes
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { WorkMailMessageFlowClient, GetRawMessageContentCommand } from '@aws-sdk/client-workmailmessageflow';
import { z } from 'zod';

//
// ─── CONFIG ────────────────────────────────────────────────────────────────────
//
const REGION = process.env.AWS_REGION || 'us-east-1';
const ORG_ID = process.env.ORGANIZATION_ID || 'default-org';
const EMAILS_TABLE = process.env.EMAILS_TABLE_NAME || 'Emails';

if (!process.env.ORGANIZATION_ID) {
  console.warn('ORGANIZATION_ID not set, using default fallback');
}

if (!process.env.EMAILS_TABLE_NAME) {
  console.warn('EMAILS_TABLE_NAME not found in env vars, using fallback');
}

const ddb = new DynamoDBClient({ region: REGION });
const workmailClient = new WorkMailMessageFlowClient({ region: REGION });

//
// ─── VALIDATION SCHEMAS ───────────────────────────────────────────────────────
//
const WebhookSchema = z.object({
  type:      z.literal('workmail_webhook'),
  userId:    z.string().nonempty(),
  messageId: z.string().nonempty(),
});

const RawEmailSchema = z.object({
  type:        z.literal('raw_email'),
  messageId:   z.string().nonempty(),
  subject:     z.string(),
  sender:      z.string().email(),
  recipients:  z.array(z.string().email()).min(1),
  timestamp:   z.string().refine((d) => !isNaN(Date.parse(d)), {
                  message: 'Invalid ISO timestamp',
                }),
  body:        z.string(),
  bodyHtml:    z.string().optional(),
  attachments: z.array(z.string()).optional(),
  headers:     z.record(z.string(), z.string()).optional(),
  direction:   z.enum(['inbound', 'outbound']).default('inbound'),
  size:        z.number().nonnegative().default(0),
  urls:        z.array(z.string()).optional(),
});

const MockEmailSchema = RawEmailSchema.extend({
  type: z.literal('mock_email'),
});

const EmailRequestSchema = z.discriminatedUnion('type', [
  WebhookSchema,
  RawEmailSchema,
  MockEmailSchema,
]);

type EmailRequest = z.infer<typeof EmailRequestSchema>;

//
// ─── POST: PROCESS EMAIL DIRECTLY ──────────────────────────────────────────────
//
export async function POST(req: Request) {
  let payload: EmailRequest;
  try {
    const rawPayload = await req.json();
    payload = EmailRequestSchema.parse(rawPayload);
  } catch (err: any) {
    console.error('❌ [email-processor] Invalid payload:', err);
    return NextResponse.json(
      { error: 'Invalid payload', details: err.errors || err.message },
      { status: 400 }
    );
  }

  try {
    console.log('📧 Processing email payload:', payload.type);
    
    // Store email in DynamoDB
    await storeEmail(payload);
    
    console.log('✅ Email processed successfully');
    
    return NextResponse.json({
      status: 'processed',
      messageId: payload.messageId,
      type: payload.type,
      message: `Email ${payload.type} processed successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('❌ [email-processor] Processing error:', {
      message: err.message,
      messageId: payload.messageId,
      type: payload.type
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to process email', 
        message: err.message,
        messageId: payload.messageId,
        type: payload.type
      },
      { status: 500 }
    );
  }
}

//
// ─── EXTRACT EMAIL CONTENT FROM WORKMAIL ──────────────────────────────────────
//
async function extractWorkMailContent(messageId: string): Promise<{
  subject: string;
  sender: string;
  recipients: string[];
  body: string;
  bodyHtml?: string;
  timestamp: string;
  size: number;
  headers: Record<string, string>;
  attachments: string[];
  urls: string[];
}> {
  try {
    console.log('📧 Fetching raw message content from WorkMail for:', messageId);
    
    const command = new GetRawMessageContentCommand({
      messageId: messageId
    });
    
    const response = await workmailClient.send(command);
    
    if (!response.messageContent) {
      throw new Error('No message content received from WorkMail');
    }
    
    // Convert the stream to string
    const rawContent = await streamToString(response.messageContent);
    
    // Parse the MIME content
    const parsedEmail = await parseMimeContent(rawContent);
    
    console.log('✅ Successfully extracted email content from WorkMail');
    return parsedEmail;
    
  } catch (error: any) {
    console.error('❌ Failed to extract WorkMail content:', error);
    throw new Error(`Failed to extract email content: ${error.message}`);
  }
}

//
// ─── HELPER FUNCTIONS FOR MIME PARSING ────────────────────────────────────────
//
async function streamToString(stream: any): Promise<string> {
  const chunks: Buffer[] = [];
  
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: any) => {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else {
        chunks.push(Buffer.from(chunk));
      }
    });
    stream.on('error', (error: any) => {
      console.error('❌ Stream error:', error);
      reject(error);
    });
    stream.on('end', () => {
      try {
        const result = Buffer.concat(chunks).toString('utf8');
        resolve(result);
      } catch (error) {
        console.error('❌ Error converting stream to string:', error);
        reject(error);
      }
    });
  });
}

async function parseMimeContent(rawContent: string): Promise<{
  subject: string;
  sender: string;
  recipients: string[];
  body: string;
  bodyHtml?: string;
  timestamp: string;
  size: number;
  headers: Record<string, string>;
  attachments: string[];
  urls: string[];
}> {
  console.log('📧 Parsing MIME content, length:', rawContent.length);
  
  const headers: Record<string, string> = {};
  const lines = rawContent.split('\n');
  let currentHeader = '';
  let headerEndIndex = -1;
  
  // Parse headers first
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.trim() === '') {
      headerEndIndex = i;
      break;
    }
    
    if (line.startsWith(' ') || line.startsWith('\t')) {
      // Continuation of previous header
      if (currentHeader) {
        headers[currentHeader] += ' ' + line.trim();
      }
    } else {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        currentHeader = line.substring(0, colonIndex).toLowerCase();
        headers[currentHeader] = line.substring(colonIndex + 1).trim();
      }
    }
  }
  
  console.log('📧 Parsed headers:', Object.keys(headers).length);
  
  // Extract basic information with safety checks
  const subject = headers['subject'] || 'No Subject';
  const sender = extractEmailFromHeader(headers['from'] || '');
  const recipients = extractEmailsFromHeader(headers['to'] || '');
  
  let timestamp: string;
  try {
    timestamp = headers['date'] ? new Date(headers['date']).toISOString() : new Date().toISOString();
  } catch (error) {
    console.warn('❌ Invalid date in email headers, using current time');
    timestamp = new Date().toISOString();
  }
  
  // Parse body content
  let body = '';
  let bodyHtml = '';
  
  if (headerEndIndex >= 0) {
    const bodyContent = lines.slice(headerEndIndex + 1).join('\n');
    console.log('📧 Body content length:', bodyContent.length);
    
    // Check if this is multipart content
    const contentType = headers['content-type'] || '';
    if (contentType.includes('multipart')) {
      // Extract boundary
      const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/);
      if (boundaryMatch) {
        const boundary = boundaryMatch[1];
        console.log('📧 Found multipart boundary:', boundary);
        
        const parts = bodyContent.split(`--${boundary}`);
        console.log('📧 Found', parts.length, 'parts');
        
        for (const part of parts) {
          if (part.trim() === '' || part.trim() === '--') continue;
          
          const partLines = part.split('\n');
          let partHeaderEndIndex = -1;
          const partHeaders: Record<string, string> = {};
          
          // Parse part headers
          for (let i = 0; i < partLines.length; i++) {
            const line = partLines[i];
            if (line.trim() === '') {
              partHeaderEndIndex = i;
              break;
            }
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
              const key = line.substring(0, colonIndex).toLowerCase();
              const value = line.substring(colonIndex + 1).trim();
              partHeaders[key] = value;
            }
          }
          
          if (partHeaderEndIndex >= 0) {
            const partContent = partLines.slice(partHeaderEndIndex + 1).join('\n').trim();
            const partContentType = partHeaders['content-type'] || '';
            
            if (partContentType.includes('text/plain')) {
              body = partContent;
              console.log('📧 Found plain text body, length:', body.length);
            } else if (partContentType.includes('text/html')) {
              bodyHtml = partContent;
              console.log('📧 Found HTML body, length:', bodyHtml.length);
            }
          }
        }
      }
    } else {
      // Single part content
      body = bodyContent.trim();
      console.log('📧 Single part body, length:', body.length);
    }
  }
  
  // Fallback if no body content found
  if (!body && !bodyHtml) {
    body = 'No message content available';
    console.log('⚠️ No body content found, using fallback');
  }
  
  const size = rawContent.length;
  
  // Extract URLs from body
  const urls = extractUrls(body + (bodyHtml || ''));
  
  // Extract attachment names (simplified)
  const attachments = extractAttachmentNames(rawContent);
  
  console.log('✅ MIME parsing complete:', {
    subject,
    sender,
    recipients: recipients.length,
    bodyLength: body.length,
    htmlBodyLength: bodyHtml?.length || 0,
    urlsFound: urls.length,
    attachmentsFound: attachments.length
  });
  
  return {
    subject,
    sender,
    recipients,
    body,
    bodyHtml: bodyHtml || undefined,
    timestamp,
    size,
    headers,
    attachments,
    urls
  };
}

function extractEmailFromHeader(header: string): string {
  if (!header) return 'unknown@email.com';
  const match = header.match(/<([^>]+)>/);
  const result = match ? match[1] : header.trim();
  return result.includes('@') ? result : 'unknown@email.com';
}

function extractEmailsFromHeader(header: string): string[] {
  if (!header) return ['unknown@email.com'];
  const emails = header.split(',').map(email => extractEmailFromHeader(email.trim()));
  const validEmails = emails.filter(email => email.includes('@'));
  return validEmails.length > 0 ? validEmails : ['unknown@email.com'];
}

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  return text.match(urlRegex) || [];
}

function extractAttachmentNames(rawContent: string): string[] {
  const attachmentRegex = /filename="([^"]+)"/gi;
  const matches = [];
  let match;
  while ((match = attachmentRegex.exec(rawContent)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

//
// ─── STORE EMAIL IN DYNAMODB - UPDATED WITH NEW ATTRIBUTES ──────────────────
//
async function storeEmail(email: EmailRequest) {
  let emailData: any = email;
  
  if (email.type === 'workmail_webhook') {
    console.log('🔍 Processing WorkMail webhook, extracting message content...');
    try {
      const extractedContent = await extractWorkMailContent(email.messageId);
      
      // Convert webhook to full email data
      emailData = {
        type: 'workmail_email',
        messageId: email.messageId,
        subject: extractedContent.subject,
        sender: extractedContent.sender,
        recipients: extractedContent.recipients,
        timestamp: extractedContent.timestamp,
        body: extractedContent.body,
        bodyHtml: extractedContent.bodyHtml,
        attachments: extractedContent.attachments,
        headers: extractedContent.headers,
        direction: 'inbound', // WorkMail webhooks are typically inbound
        size: extractedContent.size,
        urls: extractedContent.urls
      };
      
      console.log('✅ WorkMail content extracted successfully');
    } catch (error: any) {
      console.error('❌ Failed to extract WorkMail content, storing webhook data only:', error);
      // Fallback - store basic webhook info
      emailData = {
        type: 'workmail_webhook_fallback',
        messageId: email.messageId,
        subject: 'WorkMail Message (content extraction failed)',
        sender: 'unknown@workmail',
        recipients: [email.userId],
        timestamp: new Date().toISOString(),
        body: 'Email content could not be extracted from WorkMail. Check logs for details.',
        direction: 'inbound',
        size: 0
      };
    }
  }

  console.log('💾 Storing email in DynamoDB with new attributes');

  // Generate a unique email ID if not present
  const emailId = `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Determine userId - for mock emails, use the first recipient or sender
  let userId: string;
  if (email.type === 'workmail_webhook') {
    userId = email.userId; // Use userId from webhook
  } else if (emailData.direction === 'outbound') {
    userId = emailData.sender;
  } else {
    userId = emailData.recipients && emailData.recipients.length > 0 ? emailData.recipients[0] : emailData.sender;
  }

  console.log('👤 Using userId for email storage:', userId);

  // Match the webhook storage format exactly WITH NEW ATTRIBUTES
  const item: Record<string, any> = {
    // Core email attributes
    userId: { S: userId },                    // HASH key (required)
    receivedAt: { S: emailData.timestamp },   // RANGE key (required)
    messageId: { S: emailData.messageId },
    emailId: { S: emailId },
    sender: { S: emailData.sender },
    recipients: { SS: emailData.recipients && emailData.recipients.length > 0 ? emailData.recipients : [emailData.sender] },
    subject: { S: emailData.subject },
    body: { S: emailData.body || '' },
    direction: { S: emailData.direction },
    size: { N: (emailData.size || 0).toString() },
    status: { S: 'received' },
    threatLevel: { S: 'none' },
    isPhishing: { BOOL: false },
    createdAt: { S: new Date().toISOString() },

    // NEW ATTRIBUTES - Set defaults for new email attributes
    flaggedCategory: { S: 'none' },          // Default: 'none' (not flagged)
    // flaggedSeverity: undefined,           // Only set when flagged
    // investigationStatus: undefined,       // Only set when flagged
    // detectionId: undefined,               // Only set when linked to detection
    // flaggedAt: undefined,                 // Only set when flagged
    // flaggedBy: undefined,                 // Only set when flagged
    // investigationNotes: undefined,        // Only set when investigation starts
    updatedAt: { S: new Date().toISOString() }, // Track last update
  };

  // Add optional fields
  if (emailData.bodyHtml) {
    item.bodyHtml = { S: emailData.bodyHtml };
  }
  
  if (emailData.attachments && emailData.attachments.length > 0) {
    item.attachments = { SS: emailData.attachments };
  }
  
  if (emailData.headers) {
    item.headers = { S: typeof emailData.headers === 'string' ? emailData.headers : JSON.stringify(emailData.headers) };
  }
  
  if (emailData.urls && emailData.urls.length > 0) {
    item.urls = { SS: emailData.urls };
  }

  console.log('📧 Email item prepared for DynamoDB with attributes:', {
    messageId: emailData.messageId,
    userId,
    flaggedCategory: 'none',
    hasNewAttributes: true,
    bodyLength: emailData.body?.length || 0,
    hasHtmlBody: !!emailData.bodyHtml
  });

  try {
    await ddb.send(
      new PutItemCommand({
        TableName: EMAILS_TABLE,
        Item: item,
        ConditionExpression: 'attribute_not_exists(messageId)'
      })
    );
    
    console.log('✅ Email stored successfully with new attributes');
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      console.log('ℹ️ Email already exists, skipping duplicate:', emailData.messageId)
      // Don't throw error - email already exists
      return;
    }
    
    console.error('❌ DynamoDB storage failed:', {
      error: err.message,
      code: err.code,
      tableName: EMAILS_TABLE,
      messageId: emailData.messageId,
      userId: userId
    });
    throw new Error(`Failed to store email in database: ${err.message}`);
  }
}

//
// ─── GET: QUICK MOCK TEST AND HEALTH CHECK ─────────────────────────────────────
//
export async function GET(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'test';

  if (action === 'health') {
    try {
      console.log('🏥 Health check requested');
      
      return NextResponse.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: {
          orgId: ORG_ID,
          region: REGION,
          emailsTable: EMAILS_TABLE,
          hasOrgId: ORG_ID !== 'default-org'
        },
        features: {
          emailAttributes: true,
          flaggedCategories: ['none', 'ai', 'manual', 'clean'],
          investigationStatuses: ['new', 'in_progress', 'resolved'],
          severityLevels: ['critical', 'high', 'medium', 'low']
        },
        version: '2.0.0'
      });
    } catch (err: any) {
      console.error('❌ Health check failed:', err);
      return NextResponse.json(
        { 
          status: 'unhealthy', 
          error: err.message,
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }
  }

  // Mock email test - UPDATED with new attributes
  console.log('🧪 Generating mock email for testing');
  
  const mockId = `mock-${Date.now()}`;
  const mock: EmailRequest = {
    type: 'mock_email',
    messageId: `<${mockId}@encryptgate-test.com>`,
    subject: `Test Email with New Attributes - ${new Date().toLocaleString()}`,
    sender: 'test-sender@encryptgate-demo.com',
    recipients: ['contact@encryptgate.net'], // Use your monitored employee
    timestamp: new Date().toISOString(),
    body: `This is a test email generated at ${new Date().toLocaleString()} for testing the email processing system with new flagged attributes.

This email contains:
- A test subject line
- Mock sender and recipient
- Sample body content
- Test timestamp
- NEW: Default flagged category set to "none"
- NEW: Support for investigation tracking
- NEW: Email status attributes

This helps verify that the email processing pipeline is working correctly with the new email attributes for flagging and investigation tracking.`,
    bodyHtml: `<p>This is a test email generated at <strong>${new Date().toLocaleString()}</strong> for testing the email processing system with new flagged attributes.</p>
<p>This email contains:</p>
<ul>
<li>A test subject line</li>
<li>Mock sender and recipient</li>
<li>Sample body content</li>
<li>Test timestamp</li>
<li><strong>NEW:</strong> Default flagged category set to "none"</li>
<li><strong>NEW:</strong> Support for investigation tracking</li>
<li><strong>NEW:</strong> Email status attributes</li>
</ul>
<p>This helps verify that the email processing pipeline is working correctly with the new email attributes for flagging and investigation tracking.</p>`,
    attachments: [],
    headers: { 
      'X-Test': 'true', 
      'X-Generated': new Date().toISOString(),
      'X-Features': 'email-attributes-v2'
    },
    direction: 'inbound',
    size: 450,
    urls: []
  };

  try {
    await storeEmail(mock);
    
    console.log('✅ Mock email test completed with new attributes');
    
    return NextResponse.json({
      status: 'test-completed',
      action: 'mock_email_generated',
      payload: {
        messageId: mock.messageId,
        subject: mock.subject,
        sender: mock.sender,
        recipients: mock.recipients,
        timestamp: mock.timestamp,
        userId: mock.recipients[0],
        newAttributes: {
          flaggedCategory: 'none',
          hasInvestigationTracking: true,
          hasEmailStatusAttributes: true
        }
      },
      message: 'Mock email processed and stored successfully with new email attributes',
      instructions: 'Check the All Emails page to see if this test email appears with the new flagging system'
    });
  } catch (err: any) {
    console.error('❌ Mock email test failed:', err);
    return NextResponse.json(
      { 
        error: 'Mock email test failed', 
        message: err.message,
        action: 'mock_email_failed'
      },
      { status: 500 }
    );
  }
}