// app/api/email/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  ScanCommand,
  ScanCommandInput,
} from '@aws-sdk/client-dynamodb';

const REGION       = process.env.AWS_REGION           || 'us-east-1';
const ORG_ID       = process.env.ORGANIZATION_ID      || 'default-org'; // Fallback if not set
const EMAILS_TABLE = process.env.EMAILS_TABLE_NAME    || 'Emails';
const BASE_URL     = process.env.BASE_URL            || 'https://console-encryptgate.net';

console.log('📧 Email API initialized:', { REGION, ORG_ID, EMAILS_TABLE, BASE_URL });

if (!process.env.ORGANIZATION_ID) {
  console.warn('⚠️ ORGANIZATION_ID not set, using default fallback');
}

const ddb = new DynamoDBClient({ region: REGION });

// GET /api/email?limit=50&lastKey=<encoded>
export async function GET(request: Request) {
  try {
    console.log('📧 GET /api/email - Loading emails from database');
    const url = new URL(request.url);
    const rawLim = url.searchParams.get('limit') || '50';
    const rawKey = url.searchParams.get('lastKey') || undefined;

    // Parse & clamp limit
    const limit = Math.min(1000, Math.max(1, parseInt(rawLim, 10) || 50));
    console.log(`🔍 Query parameters: limit=${limit}, hasLastKey=${!!rawKey}`);

    // Build scan params
    const params: ScanCommandInput = { 
      TableName: EMAILS_TABLE, 
      Limit: limit 
    };

    // Add organization filter only if ORG_ID is not the default fallback
    if (ORG_ID && ORG_ID !== 'default-org') {
      params.FilterExpression = 'orgId = :orgId';
      params.ExpressionAttributeValues = {
        ':orgId': { S: ORG_ID }
      };
      console.log(`🏢 Filtering by organization: ${ORG_ID}`);
    } else {
      console.log('📋 Scanning all emails (no organization filter)');
    }

    // Resume pagination if lastKey present
    if (rawKey) {
      try {
        params.ExclusiveStartKey = JSON.parse(decodeURIComponent(rawKey));
        console.log('⏭️ Resuming pagination with lastKey');
      } catch (e) {
        console.warn('⚠️ Invalid lastKey, ignoring:', rawKey);
      }
    }

    console.log('🔍 Scanning DynamoDB with params:', {
      TableName: EMAILS_TABLE,
      Limit: limit,
      HasFilter: !!params.FilterExpression,
      HasPagination: !!params.ExclusiveStartKey
    });

    const resp = await ddb.send(new ScanCommand(params));
    const items = resp.Items || [];

    console.log(`✅ DynamoDB scan completed: ${items.length} items returned`);
    console.log(`📊 Scan consumed ${resp.ScannedCount} items, returned ${resp.Count} items`);

    if (items.length === 0) {
      console.log('ℹ️ No emails found in database');
      return NextResponse.json({
        emails: [],
        lastKey: null,
        hasMore: false,
        message: 'No emails found. Make sure WorkMail webhook is configured and employees are receiving emails.',
        debug: {
          orgId: ORG_ID,
          tableName: EMAILS_TABLE,
          scannedCount: resp.ScannedCount || 0,
          itemCount: resp.Count || 0,
          hasOrgFilter: ORG_ID !== 'default-org'
        }
      });
    }

    // Map DynamoDB items into plain JSON
    const emails = items.map((item, index) => {
      console.log(`📄 Processing email ${index + 1}:`, {
        messageId: item.messageId?.S || 'unknown',
        sender: item.sender?.S || 'unknown',
        subject: item.subject?.S || 'No Subject',
        timestamp: item.timestamp?.S || 'unknown'
      });

      return {
        id: item.messageId?.S || item.emailId?.S || `unknown-${index}`,
        messageId: item.messageId?.S || '',
        subject: item.subject?.S || 'No Subject',
        sender: item.sender?.S || '',
        recipients: item.recipients?.SS || [],
        timestamp: item.timestamp?.S || new Date().toISOString(),
        body: item.body?.S || '',
        bodyHtml: item.bodyHtml?.S,
        status: item.status?.S || 'received',
        threatLevel: item.threatLevel?.S || 'none',
        isPhishing: item.isPhishing?.BOOL || false,
        attachments: item.attachments?.SS || [],
        headers: item.headers?.S ? JSON.parse(item.headers.S) : {},
        direction: item.direction?.S || 'inbound',
        size: parseInt(item.size?.N || '0', 10),
        urls: item.urls?.SS || [],
      };
    });

    console.log(`✅ Successfully processed ${emails.length} emails`);
    
    // Log sample email for debugging
    if (emails.length > 0) {
      console.log('📋 Sample email data:', {
        id: emails[0].id,
        subject: emails[0].subject,
        sender: emails[0].sender,
        recipients: emails[0].recipients,
        timestamp: emails[0].timestamp,
        bodyLength: emails[0].body.length
      });
    }

    const response = {
      emails,
      lastKey: resp.LastEvaluatedKey
        ? encodeURIComponent(JSON.stringify(resp.LastEvaluatedKey))
        : null,
      hasMore: Boolean(resp.LastEvaluatedKey),
      debug: {
        orgId: ORG_ID,
        tableName: EMAILS_TABLE,
        totalItems: emails.length,
        hasMore: Boolean(resp.LastEvaluatedKey),
        hasOrgFilter: ORG_ID !== 'default-org'
      }
    };

    console.log('📤 Returning response:', {
      emailCount: emails.length,
      hasMore: response.hasMore,
      hasLastKey: !!response.lastKey
    });

    return NextResponse.json(response);

  } catch (err: any) {
    console.error('❌ [GET /api/email] error details:', {
      message: err.message,
      name: err.name,
      code: err.code,
      stack: err.stack?.split('\n').slice(0, 3)
    });

    return NextResponse.json(
      {
        error: 'Failed to fetch emails',
        details: err.message,
        code: err.code || err.name,
        troubleshooting: [
          'Check AWS credentials and permissions',
          'Verify table name exists in DynamoDB',
          'Ensure organization ID is correct (if set)',
          'Check if WorkMail webhook is configured and working'
        ],
        debug: {
          orgId: ORG_ID,
          tableName: EMAILS_TABLE,
          region: REGION,
          hasOrgFilter: ORG_ID !== 'default-org'
        }
      },
      { status: 500 }
    );
  }
}

// POST /api/email → forward to your existing processor
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
    console.log('📨 POST /api/email - Forwarding to email processor:', payload);
  } catch (err: any) {
    console.error('❌ [POST /api/email] invalid JSON:', err);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    console.log(`🔄 Forwarding to email processor: ${BASE_URL}/api/email-processor`);
    const resp = await fetch(`${BASE_URL}/api/email-processor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    const data = await resp.json();
    console.log('✅ Email processor response:', { status: resp.status, data });
    
    return NextResponse.json(data, { status: resp.status });
  } catch (err: any) {
    console.error('❌ [POST /api/email] forward error:', err);
    return NextResponse.json(
      { error: 'Failed to forward to email-processor', details: err.message },
      { status: 500 }
    );
  }
}