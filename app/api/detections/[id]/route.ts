// app/api/detections/[id]/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  UpdateItemCommand,
  GetItemCommand,
} from '@aws-sdk/client-dynamodb';

const REGION = process.env.AWS_REGION!;
const ORG_ID = process.env.ORGANIZATION_ID!;
const DETECTIONS_TABLE = process.env.DETECTIONS_TABLE_NAME!;

const ddb = new DynamoDBClient({ region: REGION });

// PATCH: update detection status
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const detectionId = params.id;
    const body = await request.json();
    const { status, assignedTo } = body;

    if (!status && !assignedTo) {
      return NextResponse.json(
        { error: 'At least one field (status or assignedTo) is required' },
        { status: 400 }
      );
    }

    // Check if detection exists
    const existingDetection = await ddb.send(new GetItemCommand({
      TableName: DETECTIONS_TABLE,
      Key: {
        orgId: { S: ORG_ID },
        detectionId: { S: detectionId },
      },
    }));

    if (!existingDetection.Item) {
      return NextResponse.json(
        { error: 'Detection not found' },
        { status: 404 }
      );
    }

    // Build update expression
    let updateExpression = 'SET lastUpdated = :now';
    const expressionAttributeValues: Record<string, any> = {
      ':now': { S: new Date().toISOString() },
    };

    if (status) {
      updateExpression += ', #status = :status';
      expressionAttributeValues[':status'] = { S: status };
    }

    if (assignedTo) {
      updateExpression += ', assignedTo = :assignedTo';
      expressionAttributeValues[':assignedTo'] = { S: JSON.stringify(assignedTo) };
    }

    await ddb.send(new UpdateItemCommand({
      TableName: DETECTIONS_TABLE,
      Key: {
        orgId: { S: ORG_ID },
        detectionId: { S: detectionId },
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: status ? { '#status': 'status' } : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
    }));

    return NextResponse.json({ success: true, detectionId });
  } catch (err: any) {
    console.error('[PATCH /api/detections/[id]] error:', err);
    return NextResponse.json(
      { error: 'Failed to update detection', details: err.message },
      { status: 500 }
    );
  }
}

// GET: get specific detection
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const detectionId = params.id;

    const resp = await ddb.send(new GetItemCommand({
      TableName: DETECTIONS_TABLE,
      Key: {
        orgId: { S: ORG_ID },
        detectionId: { S: detectionId },
      },
    }));

    if (!resp.Item) {
      return NextResponse.json(
        { error: 'Detection not found' },
        { status: 404 }
      );
    }

    const item = resp.Item;
    const detection = {
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
    };

    return NextResponse.json(detection);
  } catch (err: any) {
    console.error('[GET /api/detections/[id]] error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch detection', details: err.message },
      { status: 500 }
    );
  }
}