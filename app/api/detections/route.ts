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
      console.log('ℹ️ No detections found, returning mock data for demonstration');
      
      // Return mock data when no real data exists
      const mockDetections = [
        {
          id: 'det-001',
          detectionId: 'det-001',
          emailMessageId: '<phishing@example.com>',
          severity: 'critical',
          name: 'Phishing Attempt Detected',
          status: 'new',
          assignedTo: [],
          sentBy: 'attacker@suspicious.com',
          timestamp: new Date().toISOString(),
          description: 'Sophisticated phishing email attempting to steal credentials',
          indicators: ['Suspicious sender domain', 'Urgent language', 'Credential harvesting URL'],
          recommendations: ['Block sender', 'Warn users', 'Investigate similar emails'],
          threatScore: 95,
          confidence: 88,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'det-002',
          detectionId: 'det-002',
          emailMessageId: '<malware@example.com>',
          severity: 'high',
          name: 'Malware Detection',
          status: 'in_progress',
          assignedTo: ['John Doe'],
          sentBy: 'unknown@malware.net',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          description: 'Email contains suspicious attachment with potential malware',
          indicators: ['Malicious attachment', 'Unknown sender', 'Suspicious file type'],
          recommendations: ['Quarantine email', 'Scan endpoints', 'Block sender domain'],
          threatScore: 82,
          confidence: 92,
          createdAt: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: 'det-003',
          detectionId: 'det-003',
          emailMessageId: '<spam@example.com>',
          severity: 'medium',
          name: 'Spam Message Detected',
          status: 'resolved',
          assignedTo: ['Jane Smith'],
          sentBy: 'spam@marketing.biz',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          description: 'Unsolicited commercial email with deceptive subject line',
          indicators: ['Mass mailing', 'Deceptive subject', 'Unsubscribe fraud'],
          recommendations: ['Add to spam filter', 'Block sender', 'Monitor patterns'],
          threatScore: 45,
          confidence: 75,
          createdAt: new Date(Date.now() - 7200000).toISOString(),
        },
      ];

      return NextResponse.json(mockDetections);
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