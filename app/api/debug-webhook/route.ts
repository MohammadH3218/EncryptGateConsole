// app/api/debug-webhook/route.ts - Debug endpoint to see what Lambda is sending
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    
    // Log essential debug information only
    console.log('Debug webhook received payload with', payload.Records?.length || 0, 'records');
    
    return NextResponse.json({
      status: 'debug-received',
      message: 'Payload logged to console',
      timestamp: new Date().toISOString(),
      payloadReceived: true
    });
    
  } catch (err: any) {
    console.error('Debug webhook error:', err.message);
    return NextResponse.json({
      error: 'Failed to process debug payload',
      message: err.message
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'debug-endpoint-ready',
    message: 'Send POST requests here to debug Lambda payloads',
    timestamp: new Date().toISOString()
  });
}