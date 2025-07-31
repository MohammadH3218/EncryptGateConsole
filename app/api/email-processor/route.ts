// app/api/email-processor/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { z } from 'zod';

//
// ─── CONFIG ────────────────────────────────────────────────────────────────────
//
const REGION     = process.env.AWS_REGION!;
const FN_NAME    = process.env.EMAIL_PROCESSOR_FN_NAME!; // e.g. "EncryptGateEmailProcessor"

const lambda = new LambdaClient({ region: REGION });

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
// ─── POST: HAND OFF TO LAMBDA ──────────────────────────────────────────────────
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
    // Asynchronous (“Event”) invocation so Next.js doesn’t wait for your Lambda to finish
    await lambda.send(
      new InvokeCommand({
        FunctionName:   FN_NAME,
        InvocationType: 'Event',
        Payload:        Buffer.from(JSON.stringify(payload)),
      })
    );
    return NextResponse.json({
      status:  'processing',
      message: `Invoked ${FN_NAME} for ${payload.type}`,
    });
  } catch (err: any) {
    console.error('❌ [email-processor] Lambda invoke error:', err);
    return NextResponse.json(
      { error: 'Failed to invoke processor', message: err.message },
      { status: 500 }
    );
  }
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
    await lambda.send(
      new InvokeCommand({
        FunctionName:   FN_NAME,
        InvocationType: 'Event',
        Payload:        Buffer.from(JSON.stringify(mock)),
      })
    );
    return NextResponse.json({
      status: 'test-invoked',
      payload: mock,
    });
  } catch (err: any) {
    console.error('❌ [email-processor] Mock invoke error:', err);
    return NextResponse.json(
      { error: 'Mock invoke failed', message: err.message },
      { status: 500 }
    );
  }
}
