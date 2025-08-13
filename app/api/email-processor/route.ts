// app/api/email-processor/route.ts - UPDATED to set default email attributes
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

if (!process.env.ORGANIZATION_ID) {
  console.warn('ORGANIZATION_ID not set, using default fallback');
}

if (!process.env.EMAILS_TABLE_NAME) {
  console.warn('EMAILS_TABLE_NAME not found in env vars, using fallback');
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
// ─── STORE EMAIL IN DYNAMODB - UPDATED WITH NEW ATTRIBUTES ──────────────────
//
async function storeEmail(email: EmailRequest) {
  if (email.type === 'workmail_webhook') {
    // WorkMail webhook type - would need to fetch actual email content
    return;
  }

  console.log('💾 Storing email in DynamoDB with new attributes');

  // Generate a unique email ID if not present
  const emailId = `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Determine userId - for mock emails, use the first recipient or sender
  let userId: string;
  if (email.direction === 'outbound') {
    userId = email.sender;
  } else {
    userId = email.recipients[0]; // Use first recipient for inbound emails
  }

  console.log('👤 Using userId for email storage:', userId);

  // Match the webhook storage format exactly WITH NEW ATTRIBUTES
  const item: Record<string, any> = {
    // Core email attributes
    userId: { S: userId },                    // HASH key (required)
    receivedAt: { S: email.timestamp },       // RANGE key (required)
    messageId: { S: email.messageId },
    emailId: { S: emailId },
    sender: { S: email.sender },
    recipients: { SS: email.recipients },
    subject: { S: email.subject },
    body: { S: email.body },
    direction: { S: email.direction },
    size: { N: email.size.toString() },
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

  console.log('📧 Email item prepared for DynamoDB with attributes:', {
    messageId: email.messageId,
    userId,
    flaggedCategory: 'none',
    hasNewAttributes: true
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
      console.log('ℹ️ Email already exists, skipping duplicate:', email.messageId)
      // Don't throw error - email already exists
      return;
    }
    
    console.error('❌ DynamoDB storage failed:', {
      error: err.message,
      code: err.code,
      tableName: EMAILS_TABLE,
      messageId: email.messageId,
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