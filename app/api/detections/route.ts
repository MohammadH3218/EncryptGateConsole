// app/api/detections/route.ts - UPDATED with proper AWS setup and orgId extraction
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  ScanCommand,
  ScanCommandInput,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { ddb, extractOrgId, handleAwsError, TABLES } from '@/lib/aws';

const EMPLOYEES_TABLE = process.env.EMPLOYEES_TABLE_NAME || 'Employees';

// GET: list of detections
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
    
    console.log(`🚨 GET /api/detections - Loading detections for org: ${orgId}`);
    
    const url = new URL(request.url);
    const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
    const lastKey = url.searchParams.get('lastKey');

    const params: ScanCommandInput = {
      TableName: TABLES.DETECTIONS,
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
      return NextResponse.json([]);
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
      timestamp: item.timestamp?.S || item.receivedAt?.S || '',
      description: item.description?.S || '',
      indicators: item.indicators?.S ? JSON.parse(item.indicators.S) : [],
      recommendations: item.recommendations?.S ? JSON.parse(item.recommendations.S) : [],
      threatScore: parseInt(item.threatScore?.N || '0'),
      confidence: parseInt(item.confidence?.N || '50'),
      createdAt: item.createdAt?.S || item.receivedAt?.S || '',
      manualFlag: item.manualFlag?.BOOL || false
    }));

    return NextResponse.json(detections);
  } catch (err: any) {
    const awsError = handleAwsError(err, 'GET /api/detections');
    
    return NextResponse.json(
      {
        error: awsError.error || 'Failed to fetch detections',
        message: awsError.message,
        troubleshooting: [
          'Check AWS credentials are valid and not expired',
          'Verify IAM permissions for DynamoDB access',
          'Ensure organization ID is passed correctly',
          'Check if Detections table exists and is configured'
        ]
      },
      { status: awsError.statusCode }
    );
  }
}

// POST: create a new detection
export async function POST(request: Request) {
  try {
    // Extract organization ID from request
    const orgId = extractOrgId(request);
    if (!orgId) {
      return NextResponse.json(
        { error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    console.log(`🚩 POST /api/detections - Creating manual detection for org: ${orgId}`);

    const body = await request.json();
    console.log('📨 Manual flagging request:', body);

    // Generate unique detection ID
    const detectionId = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    // Prepare detection item for DynamoDB
    const detectionItem = {
      // Table structure: detectionId (partition key) + receivedAt (sort key)
      detectionId: { S: detectionId },           // Partition key
      receivedAt: { S: timestamp },              // Sort key
      
      // Additional fields
      orgId: { S: orgId },                       // Organization context
      emailMessageId: { S: body.emailMessageId || body.emailId },
      severity: { S: body.severity || 'medium' },
      name: { S: body.name || 'Manually Flagged Email' },
      status: { S: 'new' },
      assignedTo: { S: JSON.stringify(body.assignedTo || []) },
      sentBy: { S: body.sentBy || '' },
      timestamp: { S: timestamp },
      createdAt: { S: timestamp },
      description: { S: body.description || 'This email was manually flagged as suspicious.' },
      indicators: { S: JSON.stringify(body.indicators || ['Manual review required']) },
      recommendations: { S: JSON.stringify(body.recommendations || ['Investigate email content']) },
      threatScore: { N: (body.threatScore || 75).toString() },
      confidence: { N: (body.confidence || 90).toString() },
      manualFlag: { BOOL: true }
    };

    // Insert into DynamoDB
    const putCommand = {
      TableName: TABLES.DETECTIONS,
      Item: detectionItem
    };

    console.log('💾 Inserting detection into DynamoDB with structure:', { 
      detectionId, 
      receivedAt: timestamp,
      severity: body.severity, 
      emailMessageId: body.emailMessageId 
    });
    
    await ddb.send(new PutItemCommand(putCommand));

    console.log('✅ Manual detection created successfully:', detectionId);

    // Update the email's flagged status to 'manual' with proper attributes
    try {
      console.log('📧 Updating email flagged status to manual for:', body.emailMessageId);
      
      // Use internal helper function instead of HTTP call
      const { updateEmailAttributes } = await import('@/lib/email-helpers');
      
      const success = await updateEmailAttributes(body.emailMessageId, {
        flaggedCategory: 'manual',
        flaggedSeverity: body.severity || 'medium',
        investigationStatus: 'new',
        detectionId: detectionId,
        flaggedBy: 'analyst',
        investigationNotes: `Email manually flagged as suspicious: ${body.description || 'Manual review required'}`
      });
      
      if (success) {
        console.log('✅ Email flagged status updated to manual');
      } else {
        console.warn('⚠️ Failed to update email flagged status');
      }
    } catch (emailUpdateError: any) {
      console.warn('⚠️ Error updating email flagged status:', emailUpdateError.message);
    }

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
    const awsError = handleAwsError(err, 'POST /api/detections');
    
    return NextResponse.json(
      {
        error: awsError.error || 'Failed to create detection',
        message: awsError.message,
        troubleshooting: [
          'Check AWS credentials are valid and not expired',
          'Verify IAM permissions for DynamoDB access',
          'Ensure organization ID is passed correctly',
          'Check if Detections table exists and is configured'
        ]
      },
      { status: awsError.statusCode }
    );
  }
}