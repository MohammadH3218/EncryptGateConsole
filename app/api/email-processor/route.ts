// app/api/email-processor/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { z } from 'zod';

//
// ─── CONFIG ────────────────────────────────────────────────────────────────────
//
const REGION = process.env.AWS_REGION || 'us-east-1';
const ORG_ID = process.env.ORGANIZATION_ID || 'default-org';
const EMAILS_TABLE = process.env.EMAILS_TABLE_NAME || 'Emails';

console.log('📧 Email Processor initialized:', { REGION, ORG_ID, EMAILS_TABLE });

if (!process.env.ORGANIZATION_ID) {
  console.warn('⚠️ ORGANIZATION_ID not set, using default fallback');
}

if (!process.env.EMAILS_TABLE_NAME) {
  console.warn('⚠️ EMAILS_TABLE_NAME not found in env vars, using fallback');
}

const ddb = new DynamoDBClient({ region: REGION });

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
    console.log('📨 Email processor received payload:', {
      type: rawPayload.type,
      messageId: rawPayload.messageId,
      sender: rawPayload.sender,
      recipientCount: rawPayload.recipients?.length || 0
    });
    
    payload = EmailRequestSchema.parse(rawPayload);
  } catch (err: any) {
    console.error('❌ [email-processor] Invalid payload:', err);
    return NextResponse.json(
      { error: 'Invalid payload', details: err.errors || err.message },
      { status: 400 }
    );
  }

  try {
    console.log(`📧 Processing email: ${payload.messageId} (type: ${payload.type})`);
    
    // Store email in DynamoDB
    await storeEmail(payload);
    
    console.log(`✅ Email processed and stored successfully: ${payload.messageId}`);
    
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
// ─── STORE EMAIL IN DYNAMODB ──────────────────────────────────────────────────
//
async function storeEmail(email: EmailRequest) {
  if (email.type === 'workmail_webhook') {
    console.log('⚠️ WorkMail webhook type - would need to fetch actual email content');
    // For webhook notifications, we'd need to fetch the actual email content
    // This is a simplified implementation
    return;
  }

  console.log('💾 Storing email in DynamoDB...');

  // Generate a unique email ID if not present
  const emailId = `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const item: Record<string, any> = {
    emailId: { S: emailId },
    messageId: { S: email.messageId },
    subject: { S: email.subject },
    sender: { S: email.sender },
    recipients: { SS: email.recipients },
    timestamp: { S: email.timestamp },
    body: { S: email.body },
    status: { S: 'received' },
    threatLevel: { S: 'none' },
    isPhishing: { BOOL: false },
    direction: { S: email.direction },
    size: { N: email.size.toString() },
    createdAt: { S: new Date().toISOString() },
  };

  // Only add orgId if we have a real organization ID
  if (ORG_ID !== 'default-org') {
    item.orgId = { S: ORG_ID };
  }

  // Add optional fields
  if (email.bodyHtml) {
    item.bodyHtml = { S: email.bodyHtml };
  }
  
  if (email.attachments && email.attachments.length > 0) {
    item.attachments = { SS: email.attachments };
  }
  
  if (email.headers) {
    item.headers = { S: JSON.stringify(email.headers) };
  }
  
  if (email.urls && email.urls.length > 0) {
    item.urls = { SS: email.urls };
  }

  console.log('📝 Email item prepared for DynamoDB:', {
    orgId: ORG_ID,
    emailId,
    messageId: email.messageId,
    subject: email.subject,
    sender: email.sender,
    recipientCount: email.recipients.length,
    bodyLength: email.body.length,
    hasUrls: !!(email.urls && email.urls.length > 0),
    hasOrgId: ORG_ID !== 'default-org'
  });

  try {
    await ddb.send(
      new PutItemCommand({
        TableName: EMAILS_TABLE,
        Item: item,
      })
    );
    
    console.log('✅ Email stored in DynamoDB successfully');
  } catch (err: any) {
    console.error('❌ DynamoDB storage failed:', {
      error: err.message,
      code: err.code,
      tableName: EMAILS_TABLE,
      messageId: email.messageId
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
    // Health check
    try {
      console.log('🏥 Email processor health check');
      
      return NextResponse.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: {
          orgId: ORG_ID,
          region: REGION,
          emailsTable: EMAILS_TABLE,
          hasOrgId: ORG_ID !== 'default-org'
        },
        version: '1.0.0'
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

  // Mock email test
  console.log('🧪 Generating mock email for testing...');
  
  const mockId = `mock-${Date.now()}`;
  const mock: EmailRequest = {
    type: 'mock_email',
    messageId: `<${mockId}@encryptgate-test.com>`,
    subject: `Test Email - ${new Date().toLocaleString()}`,
    sender: 'test-sender@encryptgate-demo.com',
    recipients: ['test-recipient@company.com'],
    timestamp: new Date().toISOString(),
    body: `This is a test email generated at ${new Date().toLocaleString()} for testing the email processing system.

This email contains:
- A test subject line
- Mock sender and recipient
- Sample body content
- Test timestamp

This helps verify that the email processing pipeline is working correctly.`,
    bodyHtml: `<p>This is a test email generated at <strong>${new Date().toLocaleString()}</strong> for testing the email processing system.</p>
<p>This email contains:</p>
<ul>
<li>A test subject line</li>
<li>Mock sender and recipient</li>
<li>Sample body content</li>
<li>Test timestamp</li>
</ul>
<p>This helps verify that the email processing pipeline is working correctly.</p>`,
    attachments: [],
    headers: { 'X-Test': 'true', 'X-Generated': new Date().toISOString() },
    direction: 'inbound',
    size: 350,
    urls: []
  };

  try {
    await storeEmail(mock);
    
    console.log('✅ Mock email test completed successfully');
    
    return NextResponse.json({
      status: 'test-completed',
      action: 'mock_email_generated',
      payload: {
        messageId: mock.messageId,
        subject: mock.subject,
        sender: mock.sender,
        recipients: mock.recipients,
        timestamp: mock.timestamp
      },
      message: 'Mock email processed and stored successfully',
      instructions: 'Check the All Emails page to see if this test email appears'
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