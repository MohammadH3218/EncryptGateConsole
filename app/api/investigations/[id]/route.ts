// app/api/investigations/[id]/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ORG_ID = process.env.ORGANIZATION_ID || 'default-org';
const INVESTIGATIONS_TABLE = process.env.INVESTIGATIONS_TABLE_NAME || 'Investigations';

console.log('🔍 Investigation [id] API initialized with:', { REGION, ORG_ID, INVESTIGATIONS_TABLE });

const ddb = new DynamoDBClient({ region: REGION });

// Helper function to find investigation by ID
async function findInvestigationById(investigationId: string): Promise<any> {
  try {
    console.log('🔍 Scanning for investigation with ID:', investigationId);
    
    const scanCommand = new ScanCommand({
      TableName: INVESTIGATIONS_TABLE,
      FilterExpression: 'investigationId = :investigationId',
      ExpressionAttributeValues: {
        ':investigationId': { S: investigationId }
      },
      Limit: 1
    });
    
    const result = await ddb.send(scanCommand);
    
    if (result.Items && result.Items.length > 0) {
      const item = result.Items[0];
      console.log('✅ Found investigation:', investigationId);
      return item;
    }
    
    console.log('❌ Investigation not found:', investigationId);
    return null;
    
  } catch (error: any) {
    console.error('❌ Error scanning for investigation:', error);
    return null;
  }
}

// Helper function to find investigation by email messageId
async function findInvestigationByEmailId(emailMessageId: string): Promise<any> {
  try {
    console.log('🔍 Scanning for investigation with emailMessageId:', emailMessageId);
    
    const scanCommand = new ScanCommand({
      TableName: INVESTIGATIONS_TABLE,
      FilterExpression: 'emailMessageId = :emailMessageId',
      ExpressionAttributeValues: {
        ':emailMessageId': { S: emailMessageId }
      },
      Limit: 1
    });
    
    const result = await ddb.send(scanCommand);
    
    if (result.Items && result.Items.length > 0) {
      const item = result.Items[0];
      console.log('✅ Found investigation by email ID:', emailMessageId);
      return item;
    }
    
    console.log('❌ Investigation not found for email:', emailMessageId);
    return null;
    
  } catch (error: any) {
    console.error('❌ Error scanning for investigation by email:', error);
    return null;
  }
}

// GET: Get investigation details
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log('🔍 Getting investigation details for:', id);
    
    // Try to find by investigation ID first, then by email messageId
    let item = await findInvestigationById(id);
    if (!item) {
      item = await findInvestigationByEmailId(id);
    }
    
    if (!item) {
      return NextResponse.json(
        { error: 'Investigation not found' },
        { status: 404 }
      );
    }
    
    const investigation = {
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
    };
    
    return NextResponse.json(investigation);
    
  } catch (err: any) {
    console.error('❌ [GET /api/investigations/[id]] error:', err);
    return NextResponse.json(
      { error: 'Failed to get investigation', details: err.message },
      { status: 500 }
    );
  }
}

// PATCH: Update investigation
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('🔍 PATCH /api/investigations/[id] - Updating investigation...');
    
    const { id } = await params;
    const body = await request.json();
    const { status, progress, notes, findings, recommendations, investigatorName } = body;

    console.log('📝 Updating investigation:', id, body);

    // Find the investigation first
    let item = await findInvestigationById(id);
    if (!item) {
      item = await findInvestigationByEmailId(id);
    }
    
    if (!item) {
      return NextResponse.json(
        { error: 'Investigation not found' },
        { status: 404 }
      );
    }

    const investigationId = item.investigationId?.S;
    const createdAt = item.createdAt?.S;
    
    // Build update expression dynamically
    const updateExpressions: string[] = [];
    const attributeValues: Record<string, any> = {};
    const attributeNames: Record<string, string> = {};

    // Update timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    attributeNames['#updatedAt'] = 'updatedAt';
    attributeValues[':updatedAt'] = { S: new Date().toISOString() };

    // Create timeline entry
    const existingTimeline = item.timeline?.S ? JSON.parse(item.timeline.S) : [];
    const newTimelineEntry = {
      timestamp: new Date().toISOString(),
      action: 'investigation_updated',
      description: `Investigation updated`,
      user: investigatorName || 'Security Analyst'
    };

    if (status !== undefined) {
      updateExpressions.push('#status = :status');
      attributeNames['#status'] = 'status';
      attributeValues[':status'] = { S: status };
      
      newTimelineEntry.description = `Status changed to ${status}`;
      
      if (status === 'completed' || status === 'resolved') {
        updateExpressions.push('#completedAt = :completedAt');
        attributeNames['#completedAt'] = 'completedAt';
        attributeValues[':completedAt'] = { S: new Date().toISOString() };
      }
    }

    if (progress !== undefined) {
      updateExpressions.push('#progress = :progress');
      attributeNames['#progress'] = 'progress';
      attributeValues[':progress'] = { N: progress.toString() };
      
      if (status === undefined) {
        newTimelineEntry.description = `Progress updated to ${progress}%`;
      }
    }

    if (notes !== undefined) {
      updateExpressions.push('#notes = :notes');
      attributeNames['#notes'] = 'notes';
      attributeValues[':notes'] = { S: notes };
    }

    if (findings !== undefined) {
      updateExpressions.push('#findings = :findings');
      attributeNames['#findings'] = 'findings';
      attributeValues[':findings'] = { S: findings };
    }

    if (recommendations !== undefined) {
      updateExpressions.push('#recommendations = :recommendations');
      attributeNames['#recommendations'] = 'recommendations';
      attributeValues[':recommendations'] = { S: recommendations };
    }

    // Update timeline
    const updatedTimeline = [...existingTimeline, newTimelineEntry];
    updateExpressions.push('#timeline = :timeline');
    attributeNames['#timeline'] = 'timeline';
    attributeValues[':timeline'] = { S: JSON.stringify(updatedTimeline) };

    const updateCommand = new UpdateItemCommand({
      TableName: INVESTIGATIONS_TABLE,
      Key: {
        investigationId: { S: investigationId },
        createdAt: { S: createdAt }
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: attributeNames,
      ExpressionAttributeValues: attributeValues,
      ReturnValues: 'ALL_NEW'
    });

    const result = await ddb.send(updateCommand);
    console.log('✅ Investigation updated successfully');

    // Return updated investigation
    const updatedItem = result.Attributes;
    return NextResponse.json({
      investigationId: updatedItem?.investigationId?.S || '',
      emailMessageId: updatedItem?.emailMessageId?.S || '',
      detectionId: updatedItem?.detectionId?.S,
      investigatorName: updatedItem?.investigatorName?.S || 'Unknown',
      status: updatedItem?.status?.S || 'new',
      progress: parseInt(updatedItem?.progress?.N || '0'),
      priority: updatedItem?.priority?.S || 'medium',
      findings: updatedItem?.findings?.S || '',
      recommendations: updatedItem?.recommendations?.S || '',
      notes: updatedItem?.notes?.S || '',
      timeline: updatedItem?.timeline?.S ? JSON.parse(updatedItem.timeline.S) : [],
      createdAt: updatedItem?.createdAt?.S || '',
      updatedAt: updatedItem?.updatedAt?.S || '',
      assignedAt: updatedItem?.assignedAt?.S,
      completedAt: updatedItem?.completedAt?.S,
    });

  } catch (err: any) {
    console.error('❌ [PATCH /api/investigations/[id]] error:', err);
    return NextResponse.json(
      { error: 'Failed to update investigation', details: err.message },
      { status: 500 }
    );
  }
}