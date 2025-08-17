// app/api/email-processor/route.ts - SIMPLIFIED WorkMail-Only Version
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

const ddb = new DynamoDBClient({ region: REGION });
const workmailClient = new WorkMailMessageFlowClient({ region: REGION });

//
// ─── VALIDATION SCHEMAS ───────────────────────────────────────────────────────
//
const WorkMailWebhookSchema = z.object({
  messageId: z.string().nonempty(),
  flowDirection: z.enum(['INBOUND', 'OUTBOUND']).optional(),
  orgId: z.string().optional(),
  envelope: z.object({
    mailFrom: z.string().optional(),
    recipients: z.array(z.string()).optional()
  }).optional(),
  subject: z.string().optional(),
  raw: z.object({
    base64: z.string()
  }).optional()
});

const RawEmailSchema = z.object({
  type: z.literal('raw_email'),
  messageId: z.string().nonempty(),
  subject: z.string(),
  sender: z.string().email(),
  recipients: z.array(z.string().email()).min(1),
  timestamp: z.string().refine((d) => !isNaN(Date.parse(d)), {
    message: 'Invalid ISO timestamp',
  }),
  body: z.string(),
  bodyHtml: z.string().optional(),
  attachments: z.array(z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  direction: z.enum(['inbound', 'outbound']).default('inbound'),
  size: z.number().nonnegative().default(0),
  urls: z.array(z.string()).optional(),
});

const MockEmailSchema = RawEmailSchema.extend({
  type: z.literal('mock_email'),
});

const EmailRequestSchema = z.discriminatedUnion('type', [
  WorkMailWebhookSchema.extend({ type: z.literal('workmail_webhook') }),
  RawEmailSchema,
  MockEmailSchema,
]);

type EmailRequest = z.infer<typeof EmailRequestSchema>;

//
// ─── WORKMAIL CONTENT EXTRACTION ─────────────────────────────────────────────
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
      reject(error);
    });
    stream.on('end', () => {
      try {
        const result = Buffer.concat(chunks).toString('utf8');
        resolve(result);
      } catch (error) {
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
  
  // Extract basic information
  const subject = headers['subject'] || 'No Subject';
  const sender = extractEmailFromHeader(headers['from'] || '');
  const recipients = extractEmailsFromHeader(headers['to'] || '');
  
  let timestamp: string;
  try {
    timestamp = headers['date'] ? new Date(headers['date']).toISOString() : new Date().toISOString();
  } catch (error) {
    timestamp = new Date().toISOString();
  }
  
  // Parse body content using simple extraction
  let body = '';
  if (headerEndIndex >= 0) {
    const bodyContent = lines.slice(headerEndIndex + 1).join('\n');
    
    // Simple body extraction - remove any remaining headers and clean up
    const bodyLines = bodyContent.split('\n');
    const cleanLines = [];
    let foundContent = false;
    
    for (const line of bodyLines) {
      const trimmed = line.trim();
      
      // Skip empty lines at start
      if (!foundContent && !trimmed) continue;
      
      // Skip lines that look like headers
      if (!foundContent && /^[A-Za-z-]+:\s/.test(trimmed)) continue;
      
      foundContent = true;
      cleanLines.push(line);
    }
    
    body = cleanLines.join('\n').trim();
  }
  
  // Fallback if no body content found
  if (!body) {
    body = 'No message content available';
  }
  
  const size = rawContent.length;
  const urls = extractUrls(body);
  const attachments = extractAttachmentNames(rawContent);
  
  console.log('✅ MIME parsing complete:', {
    subject,
    sender,
    recipients: recipients.length,
    bodyLength: body.length,
    urlsFound: urls.length,
    attachmentsFound: attachments.length
  });
  
  return {
    subject,
    sender,
    recipients,
    body,
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
// ─── STORE EMAIL IN DYNAMODB ─────────────────────────────────────────────────
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
        direction: 'inbound',
        size: extractedContent.size,
        urls: extractedContent.urls
      };
      
      console.log('✅ WorkMail content extracted successfully');
    } catch (error: any) {
      console.error('❌ Failed to extract WorkMail content:', error);
      throw error; // Don't use fallback - we want real content or failure
    }
  }

  console.log('💾 Storing email in DynamoDB');

  const emailId = `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Determine userId
  const userId = emailData.direction === 'outbound' 
    ? emailData.sender
    : emailData.recipients && emailData.recipients.length > 0 
      ? emailData.recipients[0] 
      : emailData.sender;

  console.log('👤 Using userId for email storage:', userId);

  const item: Record<string, any> = {
    userId: { S: userId },
    receivedAt: { S: emailData.timestamp },
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
    flaggedCategory: { S: 'none' },
    updatedAt: { S: new Date().toISOString() },
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

  try {
    await ddb.send(
      new PutItemCommand({
        TableName: EMAILS_TABLE,
        Item: item,
        ConditionExpression: 'attribute_not_exists(messageId)'
      })
    );
    
    console.log('✅ Email stored successfully');
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      console.log('ℹ️ Email already exists, skipping duplicate:', emailData.messageId)
      return;
    }
    
    console.error('❌ DynamoDB storage failed:', err);
    throw new Error(`Failed to store email in database: ${err.message}`);
  }
}

//
// ─── POST: PROCESS EMAIL ──────────────────────────────────────────────────────
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
// ─── GET: HEALTH CHECK AND MOCK TEST ─────────────────────────────────────────
//
export async function GET(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'test';

  if (action === 'health') {
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
        processingMethod: 'workmail-only',
        s3Dependency: false,
        directWorkMailApi: true
      },
      version: 'workmail-only-v1.0'
    });
  }

  // Mock email test
  console.log('🧪 Generating mock email for testing');
  
  const mockId = `mock-${Date.now()}`;
  const mock: EmailRequest = {
    type: 'mock_email',
    messageId: `<${mockId}@encryptgate-test.com>`,
    subject: `WorkMail-Only Test - ${new Date().toLocaleString()}`,
    sender: 'test-sender@encryptgate-demo.com',
    recipients: ['contact@encryptgate.net'],
    timestamp: new Date().toISOString(),
    body: `This is a test email generated at ${new Date().toLocaleString()} for the WorkMail-only processing system.

This email demonstrates:
- Direct WorkMail Message Flow processing
- Real email body content extraction
- No SES/S3 dependencies
- Simplified processing pipeline

Test successful if you can see this real content instead of fallback messages.`,
    bodyHtml: `<p>This is a test email generated at <strong>${new Date().toLocaleString()}</strong> for the WorkMail-only processing system.</p>
<p>This email demonstrates:</p>
<ul>
<li>Direct WorkMail Message Flow processing</li>
<li>Real email body content extraction</li>
<li>No SES/S3 dependencies</li>
<li>Simplified processing pipeline</li>
</ul>
<p><strong>Test successful if you can see this real content instead of fallback messages.</strong></p>`,
    attachments: [],
    headers: { 
      'X-Test': 'workmail-only', 
      'X-Generated': new Date().toISOString()
    },
    direction: 'inbound',
    size: 350,
    urls: []
  };

  try {
    await storeEmail(mock);
    
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
        processingMethod: 'workmail-only'
      },
      message: 'Mock email processed successfully with WorkMail-only method',
      instructions: 'Check the All Emails page to see if this test email appears with real content'
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