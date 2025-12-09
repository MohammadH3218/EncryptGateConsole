import { NextResponse } from 'next/server';
import { ScanCommand } from '@aws-sdk/client-dynamodb';
import { ddb, extractOrgId, TABLES } from '@/lib/aws';

export const runtime = 'nodejs';

/**
 * GET /api/stats/detections-summary
 * Returns aggregate statistics for detections:
 * - Detections over time (last 7, 30 days)
 * - Top risky senders/domains
 * - Severity breakdown
 * - Recent detections
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

    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30');

    console.log(`📊 GET /api/stats/detections-summary - Loading summary for org: ${orgId}, days: ${days}`);

    // Scan detections table
    const scanCommand = new ScanCommand({
      TableName: TABLES.DETECTIONS,
    });

    const result = await ddb.send(scanCommand);
    const items = result.Items || [];

    // Filter by date range
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTimestamp = cutoffDate.toISOString();

    const recentDetections = items.filter((item) => {
      const createdAt = item.createdAt?.S || item.receivedAt?.S || item.timestamp?.S;
      return createdAt && createdAt >= cutoffTimestamp;
    });

    // Calculate severity breakdown
    const severityBreakdown = {
      critical: recentDetections.filter((item) => item.severity?.S === 'critical').length,
      high: recentDetections.filter((item) => item.severity?.S === 'high').length,
      medium: recentDetections.filter((item) => item.severity?.S === 'medium').length,
      low: recentDetections.filter((item) => item.severity?.S === 'low').length,
    };

    // Calculate status breakdown
    const statusBreakdown = {
      new: recentDetections.filter((item) => item.status?.S === 'new').length,
      inProgress: recentDetections.filter((item) => item.status?.S === 'in_progress').length,
      resolved: recentDetections.filter((item) => item.status?.S === 'resolved').length,
      falsePositive: recentDetections.filter((item) => item.status?.S === 'false_positive').length,
    };

    // Top risky senders (by count of high/critical detections)
    const senderCounts: Record<string, number> = {};
    recentDetections.forEach((item) => {
      const sender = item.sentBy?.S || item.from?.S;
      const severity = item.severity?.S;
      if (sender && (severity === 'high' || severity === 'critical')) {
        senderCounts[sender] = (senderCounts[sender] || 0) + 1;
      }
    });

    const topRiskySenders = Object.entries(senderCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([sender, count]) => ({ sender, count }));

    // Top risky domains (extract from sender emails)
    const domainCounts: Record<string, number> = {};
    recentDetections.forEach((item) => {
      const sender = item.sentBy?.S || item.from?.S;
      const severity = item.severity?.S;
      if (sender && (severity === 'high' || severity === 'critical')) {
        const domain = sender.split('@')[1];
        if (domain) {
          domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        }
      }
    });

    const topRiskyDomains = Object.entries(domainCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([domain, count]) => ({ domain, count }));

    // Detections over time (last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split('T')[0];
    }).reverse();

    const detectionsByDay = last7Days.map((day) => {
      const dayStart = `${day}T00:00:00.000Z`;
      const dayEnd = `${day}T23:59:59.999Z`;
      const count = items.filter((item) => {
        const createdAt = item.createdAt?.S || item.receivedAt?.S || item.timestamp?.S;
        return createdAt && createdAt >= dayStart && createdAt <= dayEnd;
      }).length;
      return { date: day, count };
    });

    // Recent detections (last 10)
    const recent = items
      .map((item) => ({
        id: item.detectionId?.S || '',
        name: item.name?.S || 'Unknown',
        severity: item.severity?.S || 'low',
        status: item.status?.S || 'new',
        sentBy: item.sentBy?.S || '',
        createdAt: item.createdAt?.S || item.receivedAt?.S || item.timestamp?.S || '',
      }))
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
      .slice(0, 10);

    const summary = {
      period: {
        days,
        startDate: cutoffDate.toISOString(),
        endDate: new Date().toISOString(),
      },
      totals: {
        allTime: items.length,
        recent: recentDetections.length,
      },
      severityBreakdown,
      statusBreakdown,
      topRiskySenders,
      topRiskyDomains,
      detectionsOverTime: detectionsByDay,
      recentDetections: recent,
    };

    console.log(`✅ Detection summary calculated:`, {
      totals: summary.totals,
      severity: severityBreakdown,
    });

    return NextResponse.json(summary);
  } catch (error: any) {
    console.error('❌ Error loading detection summary:', error);
    return NextResponse.json(
      { error: 'Failed to load detection summary', details: error.message },
      { status: 500 }
    );
  }
}

