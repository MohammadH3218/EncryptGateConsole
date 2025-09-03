// app/api/auth/activity/heartbeat/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

// Simple heartbeat endpoint for activity tracking
export async function POST() {
  try {
    // For now, just return a success response
    // In a real implementation, this would update user activity in a database
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      status: 'active'
    });
  } catch (error: any) {
    console.error('❌ Heartbeat error:', error);
    return NextResponse.json(
      { error: 'Failed to record activity', details: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Also support GET for heartbeat checks
  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    status: 'active'
  });
}