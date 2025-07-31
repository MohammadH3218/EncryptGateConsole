// app/api/detections/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  QueryCommand,
  QueryCommandInput,
} from '@aws-sdk/client-dynamodb';
import { z } from 'zod';

const REGION = process.env.AWS_REGION!;
const ORG_ID = process.env.ORGANIZATION_ID!;
const DETECTIONS_TABLE = process.env.DETECTIONS_TABLE_NAME!;

const ddb = new DynamoDBClient({ region: REGION });

// GET: paginated, time-desc list of detections
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
    const lastKey = url.searchParams.get('lastKey');

    const params: QueryCommandInput = {
      TableName: DETECTIONS_TABLE,
      IndexName: 'orgId-timestamp-index', // GSI: PK=orgId, SK=timestamp  
      KeyConditionExpression: 'orgId = :orgId',
      ExpressionAttributeValues: {
        ':orgId': { S: ORG_ID },
      },
      ScanIndexForward: false, // latest first
      Limit: limit,
    };

    if (lastKey) {
      params.ExclusiveStartKey = JSON.parse(decodeURIComponent(lastKey));
    }

    const resp = await ddb.send(new QueryCommand(params));

    const detections = (resp.Items || []).map((item) => ({
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
    console.error('[GET /api/detections] error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch detections', details: err.message },
      { status: 500 }
    );
  }
}