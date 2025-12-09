import { NextResponse } from 'next/server';
import { ScanCommand } from '@aws-sdk/client-dynamodb';
import { ddb, extractOrgId, TABLES } from '@/lib/aws';

export const runtime = 'nodejs';

/**
 * GET /api/stats/queue
 * Returns queue statistics: Total, New, In Progress, Resolved
 */
export async function GET(request: Request) {
  try {
    const orgId = extractOrgId(request);
    if (!orgId) {
      return NextResponse.json(
        { error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    console.log(`📊 GET /api/stats/queue - Loading queue stats for org: ${orgId}`);

    // Scan detections table
    const scanCommand = new ScanCommand({
      TableName: TABLES.DETECTIONS,
      // Filter by organization if needed (assuming orgId is in the table)
      // For now, we'll scan all and filter client-side if needed
    });

    const result = await ddb.send(scanCommand);
    const items = result.Items || [];

    // Calculate stats
    const stats = {
      total: items.length,
      new: items.filter((item) => item.status?.S === 'new').length,
      inProgress: items.filter((item) => item.status?.S === 'in_progress').length,
      resolved: items.filter((item) => item.status?.S === 'resolved').length,
      falsePositive: items.filter((item) => item.status?.S === 'false_positive').length,
    };

    console.log(`✅ Queue stats calculated:`, stats);

    return NextResponse.json(stats);
  } catch (error: any) {
    console.error('❌ Error loading queue stats:', error);
    return NextResponse.json(
      { error: 'Failed to load queue statistics', details: error.message },
      { status: 500 }
    );
  }
}

