// app/api/emails/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  QueryCommand,
  QueryCommandInput,
} from '@aws-sdk/client-dynamodb';
import { z } from 'zod';

const REGION       = process.env.AWS_REGION!;
const ORG_ID       = process.env.ORGANIZATION_ID!;
const EMAILS_TABLE = process.env.EMAILS_TABLE_NAME!;
const BASE_URL     = process.env.BASE_URL!; // e.g. https://console-encryptgate.net

const ddb = new DynamoDBClient({ region: REGION });

// --- Payload validation schema (for listing/filtering) ---
const EmailPayloadSchema = z.object({
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
});

type EmailPayload = z.infer<typeof EmailPayloadSchema>;

// --- GET: paginated, time-desc list of emails ---
export async function GET(request: Request) {
  try {
    const url     = new URL(request.url);
    const limit   = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
    const lastKey = url.searchParams.get('lastKey');

    const params: QueryCommandInput = {
      TableName:             EMAILS_TABLE,
      IndexName:             'orgId-timestamp-index', // GSI: PK=orgId, SK=timestamp
      KeyConditionExpression: 'orgId = :orgId',
      ExpressionAttributeValues: {
        ':orgId': { S: ORG_ID },
      },
      ScanIndexForward: false, // latest first
      Limit:            limit,
    };

    if (lastKey) {
      params.ExclusiveStartKey = JSON.parse(decodeURIComponent(lastKey));
    }

    const resp = await ddb.send(new QueryCommand(params));

    const emails = (resp.Items || []).map((item) => ({
      id:           item.emailId?.S!,
      messageId:    item.messageId?.S!,
      subject:      item.subject?.S || '',
      sender:       item.sender?.S || '',
      recipients:   item.recipients?.SS || [],
      timestamp:    item.timestamp?.S!,
      body:         item.body?.S || '',
      bodyHtml:     item.bodyHtml?.S,
      status:       item.status?.S || 'received',
      threatLevel:  item.threatLevel?.S || 'none',
      isPhishing:   item.isPhishing?.BOOL || false,
      attachments:  item.attachments?.SS || [],
      headers:      item.headers?.S ? JSON.parse(item.headers.S) : {},
      direction:    item.direction?.S || 'inbound',
      size:         parseInt(item.size?.N || '0'),
    }));

    return NextResponse.json({
      emails,
      lastKey: resp.LastEvaluatedKey
        ? encodeURIComponent(JSON.stringify(resp.LastEvaluatedKey))
        : null,
      hasMore: !!resp.LastEvaluatedKey,
    });
  } catch (err: any) {
    console.error('[GET /api/emails] error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch emails', details: err.message },
      { status: 500 }
    );
  }
}

// --- POST: forward to your email-processor Lambda via the /api/email-processor route ---
export async function POST(request: Request) {
  let payload: any;
  try {
    payload = await request.json();
  } catch (err: any) {
    console.error('[POST /api/emails] bad JSON:', err);
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400 }
    );
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
    console.error('[POST /api/emails] forward error:', err);
    return NextResponse.json(
      { error: 'Failed to forward to processor', details: err.message },
      { status: 500 }
    );
  }
}
