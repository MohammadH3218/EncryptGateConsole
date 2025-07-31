// app/api/email-processor/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { z } from 'zod';

//
// ─── CONFIG ────────────────────────────────────────────────────────────────────
//
const REGION = process.env.AWS_REGION!;
const ORG_ID = process.env.ORGANIZATION_ID!;
const EMAILS_TABLE = process.env.EMAILS_TABLE_NAME!;

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
    payload = EmailRequestSchema.parse(await req.json());
  } catch (err: any) {
    console.error('❌ [email-processor] Invalid payload:', err);
    return NextResponse.json(
      { error: 'Invalid payload', details: err.errors || err.message },
      { status: 400 }
    );
  }

  try {
    console.log(`📧 Processing email: ${payload.messageId}`);
    
    // Store email in DynamoDB
    await storeEmail(payload);
    
    console.log(`✅ Email stored successfully: ${payload.messageId}`);
    
    return NextResponse.json({
      status: 'processed',
      messageId: payload.messageId,
      message: `Email ${payload.type} processed successfully`,
    });
  } catch (err: any) {
    console.error('❌ [email-processor] Processing error:', err);
    return NextResponse.json(
      { error: 'Failed to process email', message: err.message },
      { status: 500 }
    );
  }
}

//
// ─── STORE EMAIL IN DYNAMODB ──────────────────────────────────────────────────
//
async function storeEmail(email: EmailRequest) {
  if (email.type === 'workmail_webhook') {
    // For webhook notifications, we'd need to fetch the actual email content
    // This is a simplified implementation
    return;
  }

  // Generate a unique email ID
  const emailId = `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const item: Record<string, any> = {
    orgId: { S: ORG_ID },
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

  await ddb.send(
    new PutItemCommand({
      TableName: EMAILS_TABLE,
      Item: item,
    })
  );
}

//
// ─── GET: QUICK MOCK TEST ──────────────────────────────────────────────────────
//
export async function GET(req: Request) {
  const mock: EmailRequest = {
    type:       'mock_email',
    messageId:  `<mock-${Date.now()}@example.com>`,
    subject:    'Smoke Test Email',
    sender:     'test@fake.com',
    recipients: ['user@company.com'],
    timestamp:  new Date().toISOString(),
    body:       'This is a test for the smoke-test.',
    bodyHtml:   '<p>This is a test for the smoke-test.</p>',
    attachments:[],
    headers:    { 'X-Smoke': 'true' },
    direction:  'inbound',
    size:       128,
  };

  try {
    await storeEmail(mock);
    
    return NextResponse.json({
      status: 'test-processed',
      payload: mock,
      message: 'Mock email processed and stored successfully',
    });
  } catch (err: any) {
    console.error('❌ [email-processor] Mock processing error:', err);
    return NextResponse.json(
      { error: 'Mock processing failed', message: err.message },
      { status: 500 }
    );
  }
}