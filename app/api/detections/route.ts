// app/api/detections/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  ScanCommand,
  ScanCommandInput,
} from '@aws-sdk/client-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ORG_ID = process.env.ORGANIZATION_ID!;
const DETECTIONS_TABLE = process.env.DETECTIONS_TABLE_NAME || 'Detections';

if (!ORG_ID) {
  console.error('❌ Missing ORGANIZATION_ID environment variable');
}

console.log('🚨 Detections API initialized with:', { REGION, ORG_ID, DETECTIONS_TABLE });

const ddb = new DynamoDBClient({ region: REGION });

// GET: list of detections
export async function GET(request: Request) {
  try {
    console.log('🚨 GET /api/detections - Loading detections...');
    
    const url = new URL(request.url);
    const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
    const lastKey = url.searchParams.get('lastKey');

    const params: ScanCommandInput = {
      TableName: DETECTIONS_TABLE,
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

    console.log('🔍 Scanning DynamoDB for detections...');
    const resp = await ddb.send(new ScanCommand(params));
    
    console.log(`✅ DynamoDB scan returned ${resp.Items?.length || 0} detection items`);

    if (!resp.Items || resp.Items.length === 0) {
      console.log('ℹ️ No detections found, returning empty array');
      
      // Return empty array when no real data exists
      const emptyDetections: any[] = [];

      return NextResponse.json(emptyDetections);
    }

    const detections = resp.Items.map((item) => ({
      id: item.detectionId?.S!,
      detectionId: item.detectionId?.S!,
      emailMessageId: item.emailMessageId?.S!,
      severity: item.severity?.S || 'low',
      name: item.name?.S || 'Unknown Detection',
      status: item.status?.S || 'new',
      assignedTo: item.assignedTo?.S ? JSON.parse(item.assignedTo.S) : [],
      sentBy: item.sentBy?.S || '',
      timestamp: item.timestamp?.S!,
      description: item.description?.S || '',
      indicators: item.indicators?.S ? JSON.parse(item.indicators.S) : [],
      recommendations: item.recommendations?.S ? JSON.parse(item.recommendations.S) : [],
      threatScore: parseInt(item.threatScore?.N || '0'),
      confidence: parseInt(item.confidence?.N || '50'),
      createdAt: item.createdAt?.S!,
    }));

    return NextResponse.json(detections);
  } catch (err: any) {
    console.error('❌ [GET /api/detections] error:', {
      message: err.message,
      code: err.code,
      name: err.name,
      stack: err.stack
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch detections', 
        details: err.message,
        code: err.code || err.name,
        troubleshooting: 'Check your AWS credentials, table name, and organization ID'
      },
      { status: 500 }
    );
  }
}

// POST: create a new detection (for manual flagging)
export async function POST(request: Request) {
  try {
    console.log('🚩 POST /api/detections - Creating manual detection...');
    
    if (!ORG_ID) {
      return NextResponse.json(
        { error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    console.log('📨 Manual flagging request:', body);

    // Generate unique detection ID
    const detectionId = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    // Prepare detection item for DynamoDB
    const detectionItem = {
      detectionId: { S: detectionId },
      orgId: { S: ORG_ID },
      emailMessageId: { S: body.emailMessageId || body.emailId },
      severity: { S: body.severity || 'medium' },
      name: { S: body.name || 'Manually Flagged Email' },
      status: { S: 'new' },
      assignedTo: { S: JSON.stringify(body.assignedTo || []) },
      sentBy: { S: body.sentBy || '' },
      timestamp: { S: timestamp },
      createdAt: { S: timestamp },
      receivedAt: { S: timestamp }, // Add missing receivedAt field required by DynamoDB schema
      description: { S: body.description || 'This email was manually flagged as suspicious.' },
      indicators: { S: JSON.stringify(body.indicators || ['Manual review required']) },
      recommendations: { S: JSON.stringify(body.recommendations || ['Investigate email content']) },
      threatScore: { N: (body.threatScore || 75).toString() },
      confidence: { N: (body.confidence || 90).toString() },
      manualFlag: { BOOL: true }
    };

    // Insert into DynamoDB
    const putCommand = {
      TableName: DETECTIONS_TABLE,
      Item: detectionItem
    };

    console.log('💾 Inserting detection into DynamoDB:', { detectionId, severity: body.severity, emailMessageId: body.emailMessageId });
    
    const { PutItemCommand } = await import('@aws-sdk/client-dynamodb');
    await ddb.send(new PutItemCommand(putCommand));

    console.log('✅ Manual detection created successfully:', detectionId);

    const responseData = {
      id: detectionId,
      detectionId: detectionId,
      emailMessageId: body.emailMessageId || body.emailId,
      severity: body.severity || 'medium',
      name: body.name || 'Manually Flagged Email',
      status: 'new',
      assignedTo: body.assignedTo || [],
      sentBy: body.sentBy || '',
      timestamp: timestamp,
      createdAt: timestamp,
      description: body.description || 'This email was manually flagged as suspicious.',
      indicators: body.indicators || ['Manual review required'],
      recommendations: body.recommendations || ['Investigate email content'],
      threatScore: body.threatScore || 75,
      confidence: body.confidence || 90,
      manualFlag: true
    };

    return NextResponse.json(responseData);

  } catch (err: any) {
    console.error('❌ [POST /api/detections] error:', {
      message: err.message,
      code: err.code,
      name: err.name,
      stack: err.stack
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to create detection', 
        details: err.message,
        code: err.code || err.name,
        troubleshooting: 'Check your AWS credentials, table name, and organization ID'
      },
      { status: 500 }
    );
  }
}