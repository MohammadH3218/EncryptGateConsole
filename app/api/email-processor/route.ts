// app/api/email-processor/route.ts - Enhanced for S3->Lambda->Webhook flow
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

const ddb = new DynamoDBClient({ region: REGION });

//
// ─── ENHANCED VALIDATION SCHEMAS ───────────────────────────────────────────────
//
const S3ProcessedEmailSchema = z.object({
  type: z.literal('s3_processed_email'),
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
  processingInfo: z.object({
    extractionMethod: z.string(),
    s3Bucket: z.string().optional(),
    s3Key: z.string().optional(),
    bodyLength: z.number().optional()
  }).optional()
});

// Enhanced Lambda Webhook Schema - handles direct Lambda webhook calls
const LambdaWebhookEmailSchema = z.object({
  messageId: z.string().nonempty(),
  subject: z.string(),
  sender: z.string().email(),
  recipients: z.array(z.string().email()).min(1),
  timestamp: z.string().refine((d) => !isNaN(Date.parse(d)), {
    message: 'Invalid ISO timestamp',
  }),
  body: z.string(),
  bodyHtml: z.string().optional(),
  extractionMethod: z.string().optional(),
  s3Bucket: z.string().optional(),
  s3Key: z.string().optional(),
  direction: z.enum(['inbound', 'outbound']).default('inbound'),
  size: z.number().nonnegative().default(0),
  headers: z.record(z.string(), z.string()).optional(),
  urls: z.array(z.string()).optional(),
  attachments: z.array(z.string()).optional()
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
  S3ProcessedEmailSchema,
  RawEmailSchema,
  MockEmailSchema,
]).or(LambdaWebhookEmailSchema); // Allow Lambda webhook format without type field

type EmailRequest = z.infer<typeof EmailRequestSchema>;

//
// ─── STORE EMAIL IN DYNAMODB ─────────────────────────────────────────────────
//
async function storeEmail(email: EmailRequest) {
  console.log('💾 Storing email in DynamoDB:', 'type' in email ? email.type : 'lambda_webhook');

  const emailId = `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Determine userId based on direction and monitoring
  const userId = email.direction === 'outbound' 
    ? email.sender
    : email.recipients && email.recipients.length > 0 
      ? email.recipients[0] 
      : email.sender;

  console.log('📧 Email processing details for debugging:', {
    messageId: email.messageId,
    subject: email.subject,
    sender: email.sender,
    recipients: email.recipients,
    direction: email.direction,
    userId: userId,
    timestamp: email.timestamp,
    bodyLength: email.body?.length || 0,
    bodyPreview: email.body?.substring(0, 100) || 'NO BODY'
  });

  console.log('👤 Using userId for email storage:', userId);

  const item: Record<string, any> = {
    userId: { S: userId },
    receivedAt: { S: email.timestamp },
    messageId: { S: email.messageId },
    emailId: { S: emailId },
    sender: { S: email.sender },
    recipients: { SS: email.recipients && email.recipients.length > 0 ? email.recipients : [email.sender] },
    subject: { S: email.subject },
    body: { S: email.body || '' },
    direction: { S: email.direction },
    size: { N: (email.size || 0).toString() },
    status: { S: 'received' },
    threatLevel: { S: 'none' },
    isPhishing: { BOOL: false },
    createdAt: { S: new Date().toISOString() },
    flaggedCategory: { S: 'none' },
    updatedAt: { S: new Date().toISOString() },
  };

  // Add optional fields
  if (email.bodyHtml) {
    item.bodyHtml = { S: email.bodyHtml };
  }
  
  if (email.attachments && email.attachments.length > 0) {
    item.attachments = { SS: email.attachments };
  }
  
  if (email.headers) {
    item.headers = { S: typeof email.headers === 'string' ? email.headers : JSON.stringify(email.headers) };
  }
  
  if (email.urls && email.urls.length > 0) {
    item.urls = { SS: email.urls };
  }

  // Add processing info for S3-processed emails
  if ('type' in email && email.type === 's3_processed_email' && email.processingInfo) {
    item.processingMethod = { S: email.processingInfo.extractionMethod };
    if (email.processingInfo.s3Bucket) {
      item.s3Bucket = { S: email.processingInfo.s3Bucket };
    }
    if (email.processingInfo.s3Key) {
      item.s3Key = { S: email.processingInfo.s3Key };
    }
  } else if ('extractionMethod' in email && email.extractionMethod) {
    item.processingMethod = { S: email.extractionMethod };
    if (email.s3Bucket) {
      item.s3Bucket = { S: email.s3Bucket };
    }
    if (email.s3Key) {
      item.s3Key = { S: email.s3Key };
    }
  }

  try {
    await ddb.send(
      new PutItemCommand({
        TableName: EMAILS_TABLE,
        Item: item,
        // Remove condition to allow overwrites for testing
        // ConditionExpression: 'attribute_not_exists(messageId)'
      })
    );
    
    console.log('✅ Email stored successfully in DynamoDB');
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      console.log('ℹ️ Email already exists, skipping duplicate:', email.messageId);
      console.log('⚠️ DUPLICATE EMAIL DETECTED - this might be why it\'s not appearing in UI');
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
    console.log('📥 [email-processor] Received payload structure:', {
      hasType: !!rawPayload.type,
      hasMessageId: !!rawPayload.messageId,
      hasSubject: !!rawPayload.subject,
      hasSender: !!rawPayload.sender,
      hasRecipients: !!rawPayload.recipients,
      hasBody: !!rawPayload.body,
      hasTimestamp: !!rawPayload.timestamp,
      extractionMethod: rawPayload.extractionMethod,
      topLevelKeys: Object.keys(rawPayload)
    });

    // Try to parse the payload, if Lambda format convert to expected format
    if (!rawPayload.type && rawPayload.messageId) {
      console.log('🔄 Converting Lambda webhook format to standard format');
      const lambdaPayload = {
        type: 's3_processed_email',
        messageId: rawPayload.messageId,
        subject: rawPayload.subject || 'No Subject',
        sender: rawPayload.sender,
        recipients: rawPayload.recipients,
        timestamp: rawPayload.timestamp,
        body: rawPayload.body || '',
        bodyHtml: rawPayload.bodyHtml,
        direction: rawPayload.direction || 'inbound',
        size: rawPayload.size || rawPayload.body?.length || 0,
        urls: rawPayload.urls || [],
        attachments: rawPayload.attachments || [],
        headers: rawPayload.headers || {},
        processingInfo: {
          extractionMethod: rawPayload.extractionMethod || 'SES_S3_ENHANCED',
          s3Bucket: rawPayload.s3Bucket,
          s3Key: rawPayload.s3Key,
          bodyLength: rawPayload.body?.length || 0
        }
      };
      payload = EmailRequestSchema.parse(lambdaPayload);
    } else {
      payload = EmailRequestSchema.parse(rawPayload);
    }
  } catch (err: any) {
    console.error('❌ [email-processor] Invalid payload:', err);
    // Note: req.json() can only be called once, so we can't re-read it here
    return NextResponse.json(
      { error: 'Invalid payload', details: err.errors || err.message },
      { status: 400 }
    );
  }

  try {
    console.log('📧 Processing email payload:', 'type' in payload ? payload.type : 'lambda_webhook');
    
    // Log important details for S3-processed emails
    if ('type' in payload && payload.type === 's3_processed_email') {
      console.log('📧 S3-processed email details:', {
        messageId: payload.messageId,
        subject: payload.subject,
        bodyLength: payload.body?.length || 0,
        extractionMethod: payload.processingInfo?.extractionMethod,
        s3Bucket: payload.processingInfo?.s3Bucket,
        s3Key: payload.processingInfo?.s3Key,
        hasRealContent: payload.body && payload.body.length > 10 && !payload.body.includes('No email content available')
      });
    } else if ('extractionMethod' in payload) {
      console.log('📧 Lambda webhook email details:', {
        messageId: payload.messageId,
        subject: payload.subject,
        bodyLength: payload.body?.length || 0,
        extractionMethod: payload.extractionMethod,
        s3Bucket: payload.s3Bucket,
        s3Key: payload.s3Key,
        hasRealContent: payload.body && payload.body.length > 10
      });
    }
    
    await storeEmail(payload);
    
    console.log('✅ Email processed and stored successfully');
    
    return NextResponse.json({
      status: 'processed',
      messageId: payload.messageId,
      type: 'type' in payload ? payload.type : 'lambda_webhook',
      bodyLength: payload.body?.length || 0,
      hasContent: payload.body && payload.body.length > 10,
      message: `Email ${'type' in payload ? payload.type : 'lambda_webhook'} processed successfully`,
      timestamp: new Date().toISOString(),
      ...('type' in payload && payload.type === 's3_processed_email' && {
        extractionMethod: payload.processingInfo?.extractionMethod,
        s3Info: {
          bucket: payload.processingInfo?.s3Bucket,
          key: payload.processingInfo?.s3Key
        }
      }),
      ...('extractionMethod' in payload && {
        extractionMethod: payload.extractionMethod,
        s3Info: {
          bucket: payload.s3Bucket,
          key: payload.s3Key
        }
      })
    });
  } catch (err: any) {
    console.error('❌ [email-processor] Processing error:', {
      message: err.message,
      messageId: payload?.messageId || 'unknown',
      type: payload && 'type' in payload ? payload.type : 'lambda_webhook'
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to process email', 
        message: err.message,
        messageId: payload?.messageId || 'unknown',
        type: payload && 'type' in payload ? payload.type : 'lambda_webhook'
      },
      { status: 500 }
    );
  }
}

//
// ─── GET: HEALTH CHECK AND ENHANCED MOCK TEST ────────────────────────────────
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
      supportedTypes: ['s3_processed_email', 'raw_email', 'mock_email'],
      features: {
        primaryMethod: 'SES->S3->Lambda->Webhook',
        s3Processing: true,
        enhancedMimeParsing: true,
        fullBodyExtraction: true
      },
      version: 'enhanced-email-processor-v2.0'
    });
  }

  if (action === 's3-test') {
    // Test S3-processed email format
    console.log('🧪 Generating S3-processed test email');
    
    const mockId = `s3-test-${Date.now()}`;
    const mock: EmailRequest = {
      type: 's3_processed_email',
      messageId: `<${mockId}@s3-test.encryptgate.net>`,
      subject: `S3 Enhanced Test - ${new Date().toLocaleString()}`,
      sender: 'test-s3@encryptgate-demo.com',
      recipients: ['contact@encryptgate.net'],
      timestamp: new Date().toISOString(),
      body: `This is an S3-processed test email generated at ${new Date().toLocaleString()}.

This email demonstrates the enhanced SES->S3->Lambda->Webhook flow:

✅ Full MIME parsing from S3-stored email
✅ Complete email body extraction
✅ Real content instead of metadata fallbacks
✅ Enhanced processing pipeline
✅ Proper DynamoDB storage with full content

Test successful if you can see this complete email body in your UI!

URLs for testing: https://example.com/test
Email content length: ${new Date().toISOString().length + 400} characters`,
      bodyHtml: `<p>This is an S3-processed test email generated at <strong>${new Date().toLocaleString()}</strong>.</p>
<p>This email demonstrates the enhanced SES->S3->Lambda->Webhook flow:</p>
<ul>
<li>✅ Full MIME parsing from S3-stored email</li>
<li>✅ Complete email body extraction</li>
<li>✅ Real content instead of metadata fallbacks</li>
<li>✅ Enhanced processing pipeline</li>
<li>✅ Proper DynamoDB storage with full content</li>
</ul>
<p><strong>Test successful if you can see this complete email body in your UI!</strong></p>
<p>URLs for testing: <a href="https://example.com/test">https://example.com/test</a></p>`,
      attachments: [],
      headers: { 
        'X-Test-Type': 's3-enhanced', 
        'X-Generated': new Date().toISOString(),
        'X-Processing-Method': 'SES_S3_ENHANCED'
      },
      direction: 'inbound',
      size: 650,
      urls: ['https://example.com/test'],
      processingInfo: {
        extractionMethod: 'SES_S3_ENHANCED_TEST',
        s3Bucket: 'ses-inbound-encryptgate',
        s3Key: `inbound/test-${mockId}`,
        bodyLength: 650
      }
    };

    try {
      await storeEmail(mock);
      
      return NextResponse.json({
        status: 'test-completed',
        action: 's3_enhanced_test',
        payload: {
          messageId: mock.messageId,
          subject: mock.subject,
          sender: mock.sender,
          recipients: mock.recipients,
          timestamp: mock.timestamp,
          bodyLength: mock.body.length,
          hasRealContent: true,
          processingMethod: 'S3_ENHANCED_TEST',
          extractionMethod: mock.processingInfo?.extractionMethod
        },
        message: 'S3-enhanced test email processed successfully',
        instructions: 'Check the All Emails page to see this test email with full body content',
        expectedFeatures: [
          'Full email body visible',
          'HTML content rendering',
          'URL extraction working',
          'Complete headers preserved',
          'S3 processing info stored'
        ]
      });
    } catch (err: any) {
      console.error('❌ S3 test email failed:', err);
      return NextResponse.json(
        { 
          error: 'S3 test email failed', 
          message: err.message,
          action: 's3_test_failed'
        },
        { status: 500 }
      );
    }
  }

  // Default mock email test (legacy)
  console.log('🧪 Generating standard mock email for testing');
  
  const mockId = `mock-${Date.now()}`;
  const mock: EmailRequest = {
    type: 'mock_email',
    messageId: `<${mockId}@encryptgate-test.com>`,
    subject: `Standard Test - ${new Date().toLocaleString()}`,
    sender: 'test-sender@encryptgate-demo.com',
    recipients: ['contact@encryptgate.net'],
    timestamp: new Date().toISOString(),
    body: `This is a standard test email generated at ${new Date().toLocaleString()} for basic functionality testing.

This email demonstrates basic email processing capabilities.`,
    attachments: [],
    headers: { 
      'X-Test': 'standard', 
      'X-Generated': new Date().toISOString()
    },
    direction: 'inbound',
    size: 150,
    urls: []
  };

  try {
    await storeEmail(mock);
    
    return NextResponse.json({
      status: 'test-completed',
      action: 'standard_mock_email',
      payload: {
        messageId: mock.messageId,
        subject: mock.subject,
        sender: mock.sender,
        recipients: mock.recipients,
        timestamp: mock.timestamp,
        processingMethod: 'STANDARD_MOCK'
      },
      message: 'Standard mock email processed successfully'
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