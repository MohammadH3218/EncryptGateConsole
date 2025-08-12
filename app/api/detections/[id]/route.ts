// app/api/detections/[id]/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ORG_ID = process.env.ORGANIZATION_ID!;
const DETECTIONS_TABLE = process.env.DETECTIONS_TABLE_NAME || 'Detections';

if (!ORG_ID) {
  console.error('❌ Missing ORGANIZATION_ID environment variable');
}

console.log('🚨 Detection [id] API initialized with:', { REGION, ORG_ID, DETECTIONS_TABLE });

const ddb = new DynamoDBClient({ region: REGION });

// DELETE: remove a detection (unflag)
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    console.log('🚩 DELETE /api/detections/[id] - Unflagging detection...');
    
    if (!ORG_ID) {
      return NextResponse.json(
        { error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    const detectionId = params.id;
    console.log('🗑️ Deleting detection:', detectionId);

    // Delete from DynamoDB
    const deleteCommand = {
      TableName: DETECTIONS_TABLE,
      Key: {
        detectionId: { S: detectionId }
      }
    };

    console.log('💾 Deleting detection from DynamoDB:', detectionId);
    await ddb.send(new DeleteItemCommand(deleteCommand));

    console.log('✅ Detection deleted successfully:', detectionId);

    return NextResponse.json({
      success: true,
      message: 'Detection unflagged successfully',
      detectionId: detectionId
    });

  } catch (err: any) {
    console.error('❌ [DELETE /api/detections/[id]] error:', {
      message: err.message,
      code: err.code,
      name: err.name,
      stack: err.stack
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to unflag detection', 
        details: err.message,
        code: err.code || err.name,
        troubleshooting: 'Check your AWS credentials, table name, and organization ID'
      },
      { status: 500 }
    );
  }
}
