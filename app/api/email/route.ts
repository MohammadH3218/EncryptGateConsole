// app/api/email/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  ScanCommand,
  ScanCommandInput,
} from '@aws-sdk/client-dynamodb';
import { z } from 'zod';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ORG_ID = process.env.ORGANIZATION_ID!;
const EMAILS_TABLE = process.env.EMAILS_TABLE_NAME || 'Emails';
const BASE_URL = process.env.BASE_URL || 'https://console-encryptgate.net';

if (!ORG_ID) {
  console.error('❌ Missing ORGANIZATION_ID environment variable');
}

if (!EMAILS_TABLE) {
  console.error('❌ Missing EMAILS_TABLE_NAME environment variable');
}

console.log('📧 Email API initialized with:', { REGION, ORG_ID, EMAILS_TABLE });

const ddb = new DynamoDBClient({ region: REGION });

// GET: list of emails with pagination
export async function GET(request: Request) {
  try {
    console.log('📧 GET /api/email - Loading emails...');
    
    const url = new URL(request.url);
    const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
    const lastKey = url.searchParams.get('lastKey');

    // First, check if table exists and has data
    const params: ScanCommandInput = {
      TableName: EMAILS_TABLE,
      FilterExpression: 'orgId = :orgId',
      ExpressionAttributeValues: {
        ':orgId': { S: ORG_ID },
      },
      Limit: limit,
    };

    if (lastKey) {
      try {
        params.ExclusiveStartKey = JSON.parse(decodeURIComponent(lastKey));
      } catch (e) {
        console.warn('Invalid lastKey, ignoring:', lastKey);
      }
    }

    console.log('🔍 Scanning DynamoDB with params:', {
      TableName: EMAILS_TABLE,
      OrgId: ORG_ID,
      Limit: limit
    });

    const resp = await ddb.send(new ScanCommand(params));
    
    console.log(`✅ DynamoDB scan returned ${resp.Items?.length || 0} items`);

    if (!resp.Items || resp.Items.length === 0) {
      console.log('ℹ️ No emails found, returning mock data for demonstration');
      
      // Return mock data when no real data exists
      const mockEmails = [
        {
          id: 'mock-1',
          messageId: '<mock-email-1@example.com>',
          subject: 'Welcome to EncryptGate Demo',
          sender: 'demo@encryptgate.com',
          recipients: ['user@company.com'],
          timestamp: new Date().toISOString(),
          body: 'This is a demo email to show the interface.',
          bodyHtml: '<p>This is a demo email to show the interface.</p>',
          status: 'received',
          threatLevel: 'none',
          isPhishing: false,
          attachments: [],
          headers: {},
          direction: 'inbound',
          size: 156,
        },
        {
          id: 'mock-2',
          messageId: '<suspicious-email@phishing.com>',
          subject: 'URGENT: Verify Your Account Now!',
          sender: 'noreply@suspicious.com',
          recipients: ['employee@company.com'],
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          body: 'Your account will be suspended. Click here to verify immediately!',
          bodyHtml: '<p>Your account will be suspended. <a href="http://phishing.com">Click here</a> to verify immediately!</p>',
          status: 'analyzed',
          threatLevel: 'high',
          isPhishing: true,
          attachments: [],
          headers: {},
          direction: 'inbound',
          size: 234,
        }
      ];

      return NextResponse.json({
        emails: mockEmails,
        lastKey: null,
        hasMore: false,
        note: 'Mock data - configure your email processor to see real emails'
      });
    }

    const emails = resp.Items.map((item) => ({
      id: item.emailId?.S || item.messageId?.S || 'unknown',
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
      size: parseInt(item.size?.N || '0'),
      urls: item.urls?.SS || [],
    }));

    return NextResponse.json({
      emails,
      lastKey: resp.LastEvaluatedKey
        ? encodeURIComponent(JSON.stringify(resp.LastEvaluatedKey))
        : null,
      hasMore: !!resp.LastEvaluatedKey,
    });
  } catch (err: any) {
    console.error('❌ [GET /api/email] error:', {
      message: err.message,
      code: err.code,
      name: err.name,
      stack: err.stack
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch emails', 
        details: err.message,
        code: err.code || err.name,
        troubleshooting: 'Check your AWS credentials, table name, and organization ID'
      },
      { status: 500 }
    );
  }
}

// POST: forward to your email-processor
export async function POST(request: Request) {
  let payload: any;
  try {
    payload = await request.json();
  } catch (err: any) {
    console.error('[POST /api/email] bad JSON:', err);
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400 }
    );
  }

  try {
    const resp = await fetch(`${BASE_URL}/api/email-processor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err: any) {
    console.error('[POST /api/email] forward error:', err);
    return NextResponse.json(
      { error: 'Failed to forward to processor', details: err.message },
      { status: 500 }
    );
  }
}