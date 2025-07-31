// app/api/email/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  ScanCommand,
  ScanCommandInput,
} from '@aws-sdk/client-dynamodb';
import { z } from 'zod';

const REGION       = process.env.AWS_REGION           || 'us-east-1';
const EMAILS_TABLE = process.env.EMAILS_TABLE_NAME    || 'Emails';
const BASE_URL     = process.env.BASE_URL            || 'https://console-encryptgate.net';

if (!process.env.EMAILS_TABLE_NAME) {
  console.error('❌ Missing EMAILS_TABLE_NAME env var—falling back to "Emails"');
}

console.log('📧 Email API initialized:', { REGION, EMAILS_TABLE });

const ddb = new DynamoDBClient({ region: REGION });

// GET /api/email?limit=50&lastKey=<encoded>
export async function GET(request: Request) {
  try {
    console.log('📧 GET /api/email - attempt to load emails');
    const url     = new URL(request.url);
    const rawLim  = url.searchParams.get('limit')  || '50';
    const rawKey  = url.searchParams.get('lastKey') || undefined;

    // parse & clamp limit
    const limit = Math.min(1000, Math.max(1, parseInt(rawLim, 10) || 50));

    // build scan params (no filter so real items come back)
    const params: ScanCommandInput = { TableName: EMAILS_TABLE, Limit: limit };

    // resume pagination if lastKey present
    if (rawKey) {
      try {
        params.ExclusiveStartKey = JSON.parse(decodeURIComponent(rawKey));
      } catch (e) {
        console.warn('⚠️ Invalid lastKey, ignoring:', rawKey);
      }
    }

    console.log('🔍 Scanning DynamoDB:', { TableName: EMAILS_TABLE, Limit: limit });
    const resp = await ddb.send(new ScanCommand(params));
    const items = resp.Items || [];

    console.log(`✅ Scan returned ${items.length} items`);

    // fallback to mock data if table is empty
    if (items.length === 0) {
      console.log('ℹ️ No emails found—returning mock demo data');
      const now = new Date().toISOString();
      const mockEmails = [
        {
          id:          'mock-1',
          messageId:   '<demo1@encryptgate.net>',
          subject:     'Welcome to EncryptGate Demo',
          sender:      'demo@encryptgate.com',
          recipients:  ['user@company.com'],
          timestamp:   now,
          body:        'This is a demo email to show the interface.',
          bodyHtml:    '<p>This is a demo email to show the interface.</p>',
          status:      'received',
          threatLevel: 'none',
          isPhishing:  false,
          attachments: [] as string[],
          headers:     {} as Record<string,unknown>,
          direction:   'inbound',
          size:        123,
          urls:        [] as string[],
        },
        {
          id:          'mock-2',
          messageId:   '<phish@scam.com>',
          subject:     'URGENT: Verify Your Account Now!',
          sender:      'noreply@scam.com',
          recipients:  ['employee@company.com'],
          timestamp:   new Date(Date.now() - 3600_000).toISOString(),
          body:        'Your account will be suspended. Click here!',
          bodyHtml:    '<p>Your account will be suspended. <a href="http://scam.com">Click here</a>!</p>',
          status:      'analyzed',
          threatLevel: 'high',
          isPhishing:  true,
          attachments: [] as string[],
          headers:     {} as Record<string,unknown>,
          direction:   'inbound',
          size:        234,
          urls:        ['http://scam.com']
        }
      ];

      return NextResponse.json({
        emails:  mockEmails,
        lastKey: null,
        hasMore: false,
        note:    '📣 Mock data – configure your email processor to see real emails'
      });
    }

    // map DynamoDB items into plain JSON
    const emails = items.map(item => ({
      id:          item.messageId?.S || 'unknown',
      messageId:   item.messageId?.S || '',
      subject:     item.subject?.S     || 'No Subject',
      sender:      item.sender?.S      || '',
      recipients:  item.recipients?.SS || [],
      timestamp:   item.timestamp?.S   || new Date().toISOString(),
      body:        item.body?.S        || '',
      bodyHtml:    item.bodyHtml?.S,
      status:      item.status?.S      || 'received',
      threatLevel: item.threatLevel?.S || 'none',
      isPhishing:  item.isPhishing?.BOOL || false,
      attachments: item.attachments?.SS  || [],
      headers:     item.headers?.S ? JSON.parse(item.headers.S) : {},
      direction:   item.direction?.S   || 'inbound',
      size:        parseInt(item.size?.N || '0', 10),
      urls:        item.urls?.SS        || [],
    }));

    return NextResponse.json({
      emails,
      lastKey: resp.LastEvaluatedKey
        ? encodeURIComponent(JSON.stringify(resp.LastEvaluatedKey))
        : null,
      hasMore: Boolean(resp.LastEvaluatedKey)
    });

  } catch (err: any) {
    console.error('❌ [GET /api/email] error:', {
      message: err.message,
      name:    err.name,
      stack:   err.stack
    });
    return NextResponse.json(
      {
        error:          'Failed to fetch emails',
        details:        err.message,
        code:           err.code || err.name,
        troubleshooting:
          'Ensure AWS credentials, region, and table name are correct'
      },
      { status: 500 }
    );
  }
}

// POST /api/email  → forward to your existing processor
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch (err: any) {
    console.error('[POST /api/email] invalid JSON:', err);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const resp = await fetch(`${BASE_URL}/api/email-processor`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err: any) {
    console.error('[POST /api/email] forward error:', err);
    return NextResponse.json(
      { error: 'Failed to forward to email-processor', details: err.message },
      { status: 500 }
    );
  }
}
