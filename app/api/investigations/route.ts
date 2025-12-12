// app/api/investigations/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import { extractOrgId } from '@/lib/aws';

const REGION = process.env.AWS_REGION || 'us-east-1';
const INVESTIGATIONS_TABLE = process.env.INVESTIGATIONS_TABLE_NAME || 'Investigations';

console.log('🔍 Investigations API initialized with:', { REGION, INVESTIGATIONS_TABLE });

// DynamoDB client - use explicit credentials if available (for local dev)
function getDynamoDBClient() {
  if (process.env.ACCESS_KEY_ID && process.env.SECRET_ACCESS_KEY) {
    return new DynamoDBClient({
      region: REGION,
      credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID,
        secretAccessKey: process.env.SECRET_ACCESS_KEY,
      },
    });
  }
  return new DynamoDBClient({ region: REGION });
}

const ddb = getDynamoDBClient();

// GET: List investigations
export async function GET(request: Request) {
  try {
    // Extract organization ID from request
    const orgId = extractOrgId(request);
    if (!orgId) {
      return NextResponse.json({
        ok: false,
        error: 'MISSING_ORG_ID',
        message: 'Organization ID is required'
      }, { status: 400 });
    }

    console.log(`🔍 GET /api/investigations - Loading investigations for org: ${orgId}`);

    const url = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
    const emailMessageId = url.searchParams.get('emailMessageId');
    const status = url.searchParams.get('status');

    let queryParams: any = {
      TableName: INVESTIGATIONS_TABLE,
      Limit: limit,
      // Always filter by organization
      FilterExpression: '(orgId = :orgId OR organizationId = :orgId)',
      ExpressionAttributeValues: {
        ':orgId': { S: orgId }
      }
    };

    // If filtering by email, add to filter
    if (emailMessageId) {
      queryParams.FilterExpression += ' AND emailMessageId = :emailMessageId';
      queryParams.ExpressionAttributeValues[':emailMessageId'] = { S: emailMessageId };
    }

    // Add status filter if provided
    if (status) {
      queryParams.FilterExpression += ' AND #status = :status';
      queryParams.ExpressionAttributeValues[':status'] = { S: status };
      queryParams.ExpressionAttributeNames = { '#status': 'status' };
    }

    const command = emailMessageId ? new ScanCommand(queryParams) : new ScanCommand(queryParams);
    const result = await ddb.send(command);

    const investigations = (result.Items || []).map(item => ({
      investigationId: item.investigationId?.S || '',
      emailMessageId: item.emailMessageId?.S || '',
      detectionId: item.detectionId?.S,
      investigatorName: item.investigatorName?.S || 'Unknown',
      status: item.status?.S || 'new',
      progress: parseInt(item.progress?.N || '0'),
      priority: item.priority?.S || 'medium',
      findings: item.findings?.S || '',
      recommendations: item.recommendations?.S || '',
      notes: item.notes?.S || '',
      timeline: item.timeline?.S ? JSON.parse(item.timeline.S) : [],
      createdAt: item.createdAt?.S || '',
      updatedAt: item.updatedAt?.S || '',
      assignedAt: item.assignedAt?.S,
      completedAt: item.completedAt?.S,
    }));

    console.log(`✅ Retrieved ${investigations.length} investigations`);
    return NextResponse.json(investigations);
    
  } catch (err: any) {
    console.error('❌ [GET /api/investigations] error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch investigations', details: err.message },
      { status: 500 }
    );
  }
}

// POST: Create new investigation
export async function POST(request: Request) {
  try {
    console.log('🔍 POST /api/investigations - Creating investigation...');
    
    const body = await request.json();
    const { emailMessageId, detectionId, investigatorName, priority = 'medium', emailSubject, sender, severity } = body;

    if (!emailMessageId || !investigatorName) {
      return NextResponse.json(
        { error: 'emailMessageId and investigatorName are required' },
        { status: 400 }
      );
    }

    const investigationId = `inv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    const timelineEntry = {
      timestamp,
      action: 'investigation_created',
      description: 'Investigation created',
      user: investigatorName
    };

    const investigationItem: Record<string, any> = {
      investigationId: { S: investigationId },
      createdAt: { S: timestamp },
      emailMessageId: { S: emailMessageId },
      investigatorName: { S: investigatorName },
      status: { S: 'active' }, // Set to 'active' for in-progress investigations
      progress: { N: '0' },
      priority: { S: priority },
      findings: { S: '' },
      recommendations: { S: '' },
      notes: { S: '' },
      timeline: { S: JSON.stringify([timelineEntry]) },
      updatedAt: { S: timestamp },
      assignedAt: { S: timestamp },
    };

    // Add detection ID if provided
    if (detectionId) {
      investigationItem.detectionId = { S: detectionId };
    }
    
    // Add email subject and sender if provided
    if (emailSubject) {
      investigationItem.emailSubject = { S: emailSubject };
    }
    
    if (sender) {
      investigationItem.sender = { S: sender };
    }
    
    if (severity) {
      investigationItem.severity = { S: severity };
    }

    await ddb.send(new PutItemCommand({
      TableName: INVESTIGATIONS_TABLE,
      Item: investigationItem,
    }));

    console.log('✅ Investigation created successfully:', investigationId);

    return NextResponse.json({
      investigationId,
      emailMessageId,
      detectionId,
      investigatorName,
      status: 'active',
      progress: 0,
      priority,
      findings: '',
      recommendations: '',
      notes: '',
      timeline: [timelineEntry],
      createdAt: timestamp,
      updatedAt: timestamp,
      assignedAt: timestamp,
    });

  } catch (err: any) {
    console.error('❌ [POST /api/investigations] error:', err);
    return NextResponse.json(
      { error: 'Failed to create investigation', details: err.message },
      { status: 500 }
    );
  }
}