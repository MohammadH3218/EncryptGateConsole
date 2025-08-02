// app/api/debug-webhook/route.ts - Debug endpoint to see what Lambda is sending
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    
    console.log('🔍 DEBUG: Received payload from Lambda:');
    console.log(JSON.stringify(payload, null, 2));
    
    // Log the structure
    console.log('🔍 DEBUG: Payload structure analysis:');
    console.log('- Has Records:', !!payload.Records);
    console.log('- Records length:', payload.Records?.length || 0);
    
    if (payload.Records?.[0]) {
      const record = payload.Records[0];
      console.log('- First record has ses:', !!record.ses);
      console.log('- First record has mail:', !!record.ses?.mail);
      console.log('- notificationType:', record.ses?.notificationType);
      
      if (record.ses?.mail) {
        const mail = record.ses.mail;
        console.log('- mail.messageId:', mail.messageId);
        console.log('- mail.timestamp:', mail.timestamp);
        console.log('- mail.source:', mail.source);
        console.log('- mail.destination:', mail.destination);
        console.log('- mail.commonHeaders:', !!mail.commonHeaders);
        
        if (mail.commonHeaders) {
          console.log('  - from:', mail.commonHeaders.from);
          console.log('  - to:', mail.commonHeaders.to);
          console.log('  - subject:', mail.commonHeaders.subject);
        }
      }
    }
    
    return NextResponse.json({
      status: 'debug-received',
      message: 'Payload logged to console',
      timestamp: new Date().toISOString(),
      payloadReceived: true
    });
    
  } catch (err: any) {
    console.error('🔍 DEBUG: Error processing payload:', err);
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