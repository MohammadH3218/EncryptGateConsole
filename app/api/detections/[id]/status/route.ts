// app/api/detections/[id]/status/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  UpdateItemCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const DETECTIONS_TABLE = process.env.DETECTIONS_TABLE_NAME || 'Detections';

console.log('🚨 Detection Status API initialized with:', { REGION, DETECTIONS_TABLE });

const ddb = new DynamoDBClient({ region: REGION });

// Helper function to find detection
async function findDetectionByDetectionId(detectionId: string): Promise<any> {
  try {
    const scanCommand = new ScanCommand({
      TableName: DETECTIONS_TABLE,
      FilterExpression: 'detectionId = :detectionId',
      ExpressionAttributeValues: {
        ':detectionId': { S: detectionId }
      },
      Limit: 1
    });
    
    const result = await ddb.send(scanCommand);
    
    if (result.Items && result.Items.length > 0) {
      const item = result.Items[0];
      return {
        item: item,
        key: {
          detectionId: { S: item.detectionId?.S },
          receivedAt: { S: item.receivedAt?.S }
        }
      };
    }
    
    return null;
  } catch (error: any) {
    console.error('❌ Error scanning for detection:', error);
    return null;
  }
}

// PATCH: update detection status
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: detectionId } = await params;
    const body = await request.json();
    const { status, assignedTo, notes } = body;

    console.log('📝 Updating detection status:', { detectionId, status, assignedTo });

    // Find the detection
    const detectionInfo = await findDetectionByDetectionId(detectionId);
    
    if (!detectionInfo) {
      console.warn('⚠️ Detection not found for status update:', detectionId);
      return NextResponse.json(
        { error: 'Detection not found' },
        { status: 404 }
      );
    }

    const { key } = detectionInfo;

    // Build update expression
    const updateExpressions = [];
    const expressionAttributeValues: any = {};
    const expressionAttributeNames: any = {};

    if (status) {
      updateExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = { S: status };
    }

    if (assignedTo) {
      updateExpressions.push('assignedTo = :assignedTo');
      expressionAttributeValues[':assignedTo'] = { S: JSON.stringify(assignedTo) };
    }

    if (notes) {
      updateExpressions.push('notes = :notes');
      expressionAttributeValues[':notes'] = { S: notes };
    }

    // Always update lastModified
    updateExpressions.push('lastModified = :lastModified');
    expressionAttributeValues[':lastModified'] = { S: new Date().toISOString() };

    if (updateExpressions.length === 1) { // Only lastModified
      return NextResponse.json({
        success: true,
        message: 'No changes to update',
        detectionId
      });
    }

    const updateCommand = new UpdateItemCommand({
      TableName: DETECTIONS_TABLE,
      Key: key,
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ...(Object.keys(expressionAttributeNames).length > 0 && {
        ExpressionAttributeNames: expressionAttributeNames
      }),
      ReturnValues: 'UPDATED_NEW'
    });

    await ddb.send(updateCommand);
    console.log('✅ Detection status updated successfully');

    return NextResponse.json({
      success: true,
      message: 'Detection status updated',
      detectionId,
      updatedFields: { status, assignedTo, notes }
    });

  } catch (err: any) {
    console.error('❌ [PATCH /api/detections/[id]/status] error:', err);
    return NextResponse.json(
      { 
        error: 'Failed to update detection status', 
        details: err.message 
      },
      { status: 500 }
    );
  }
}

// GET: get detection status
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: detectionId } = await params;
    
    const detectionInfo = await findDetectionByDetectionId(detectionId);
    
    if (!detectionInfo) {
      return NextResponse.json(
        { error: 'Detection not found' },
        { status: 404 }
      );
    }
    
    const item = detectionInfo.item;
    
    return NextResponse.json({
      detectionId: item.detectionId?.S,
      status: item.status?.S || 'new',
      assignedTo: item.assignedTo?.S ? JSON.parse(item.assignedTo.S) : [],
      notes: item.notes?.S || '',
      lastModified: item.lastModified?.S || item.receivedAt?.S
    });
    
  } catch (err: any) {
    console.error('❌ [GET /api/detections/[id]/status] error:', err);
    return NextResponse.json(
      { error: 'Failed to get detection status', details: err.message },
      { status: 500 }
    );
  }
}