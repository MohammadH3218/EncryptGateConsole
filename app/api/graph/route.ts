// app/api/graph/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureNeo4jConnection } from '@/lib/neo4j';
import { getCopilotService } from '@/lib/copilot';

//
// ─── VALIDATION ────────────────────────────────────────────────────────────────
//
const GraphRequestSchema = z.object({
  action: z.enum(['add_email','query_copilot','get_email_context']),
  data:   z.any(),
});
type GraphRequest = z.infer<typeof GraphRequestSchema>;

//
// ─── POST: DIRECT NEO4J OPERATIONS ─────────────────────────────────────────────
//
export async function POST(req: Request) {
  // 1) parse JSON
  let payload: any;
  try {
    payload = await req.json();
  } catch (err: any) {
    console.error('[POST /api/graph] invalid JSON', err);
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400 }
    );
  }

  // 2) validate shape
  let graphReq: GraphRequest;
  try {
    graphReq = GraphRequestSchema.parse(payload);
  } catch (err: any) {
    console.error('[POST /api/graph] validation failed', err);
    return NextResponse.json(
      { error: 'Bad request', details: err.errors || err.message },
      { status: 400 }
    );
  }

  try {
    console.log(`🔍 Processing graph action: ${graphReq.action}`);
    
    switch (graphReq.action) {
      case 'add_email':
        return await handleAddEmail(graphReq.data);
      
      case 'query_copilot':
        return await handleQueryCopilot(graphReq.data);
      
      case 'get_email_context':
        return await handleGetEmailContext(graphReq.data);
      
      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }
  } catch (err: any) {
    console.error('[POST /api/graph] processing error', err);
    return NextResponse.json(
      { error: 'Graph operation failed', message: err.message },
      { status: 500 }
    );
  }
}

//
// ─── ACTION HANDLERS ────────────────────────────────────────────────────────────
//
async function handleAddEmail(data: any) {
  const neo4j = await ensureNeo4jConnection();
  
  // Extract URLs from body if not provided
  if (!data.urls && data.body) {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    data.urls = data.body.match(urlRegex) || [];
  }
  
  await neo4j.addEmail({
    messageId: data.messageId,
    sender: data.sender,
    recipients: data.recipients || [],
    subject: data.subject || '',
    body: data.body || '',
    timestamp: data.timestamp,
    urls: data.urls || [],
  });
  
  console.log(`✅ Email added to graph: ${data.messageId}`);
  
  return NextResponse.json({
    success: true,
    message: 'Email added to graph database',
    messageId: data.messageId,
  });
}

async function handleQueryCopilot(data: any) {
  const copilot = getCopilotService();
  
  const { question, messageId, context, detectionData } = data;
  
  // Get email context if messageId provided
  let emailContext = context;
  if (messageId && !emailContext) {
    emailContext = await copilot.getEmailContext(messageId);
  }
  
  // Process the question
  const result = await copilot.processQuestion(question, emailContext);
  
  console.log(`🤖 Copilot query processed: ${question}`);
  
  return NextResponse.json({
    response: result.response,
    confidence: result.confidence,
    error: result.error,
    context: emailContext,
  });
}

async function handleGetEmailContext(data: any) {
  const copilot = getCopilotService();
  const { messageId } = data;
  
  if (!messageId) {
    return NextResponse.json(
      { error: 'messageId required' },
      { status: 400 }
    );
  }
  
  const context = await copilot.getEmailContext(messageId);
  
  console.log(`📧 Email context retrieved: ${messageId}`);
  
  return NextResponse.json({
    context,
    messageId,
  });
}