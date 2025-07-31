// app/api/graph/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCopilotService } from '@/lib/copilot';

//
// ─── VALIDATION ────────────────────────────────────────────────────────────────
//
const GraphRequestSchema = z.object({
  action: z.enum([ 'add_email', 'query_copilot', 'get_email_context' ]),
  data:   z.any(),
});
type GraphRequest = z.infer<typeof GraphRequestSchema>;

//
// ─── Extend Copilot type to include addEmail ───────────────────────────────────
//
type CopilotWithAdd = ReturnType<typeof getCopilotService> & {
  addEmail: (params: {
    messageId: string;
    sender: string;
    recipients: string[];
    subject: string;
    body: string;
    timestamp: string;
    urls: string[];
  }) => Promise<void>;
};

//
// ─── POST: ROUTER ───────────────────────────────────────────────────────────────
//
export async function POST(req: Request) {
  // 1) parse JSON
  let payload: any;
  try {
    payload = await req.json();
  } catch (err: any) {
    console.error('[POST /api/graph] invalid JSON', err);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
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

  // 3) grab our Copilot service (with addEmail)
  const copilot = getCopilotService() as CopilotWithAdd;

  try {
    console.log(`🔍 Processing graph action: ${graphReq.action}`);

    switch (graphReq.action) {
      // ─── Add a new email node + relationships ───────────────────────────
      case 'add_email': {
        const emailData = graphReq.data as {
          messageId: string;
          sender: string;
          recipients?: string[];
          subject?: string;
          body?: string;
          timestamp: string;
          urls?: string[];
        };

        // extract URLs if none provided
        if (!emailData.urls && typeof emailData.body === 'string') {
          const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
          emailData.urls = emailData.body.match(urlRegex) || [];
        }

        await copilot.addEmail({
          messageId:  emailData.messageId,
          sender:     emailData.sender,
          recipients: emailData.recipients || [],
          subject:    emailData.subject    || '',
          body:       emailData.body       || '',
          timestamp:  emailData.timestamp,
          urls:       emailData.urls       || []
        });

        console.log(`✅ Email added to graph: ${emailData.messageId}`);
        return NextResponse.json({
          success:   true,
          message:   'Email added to graph database',
          messageId: emailData.messageId
        });
      }

      // ─── Run a Copilot query against the graph ────────────────────────────
      case 'query_copilot': {
        const { question, messageId, context } = graphReq.data as {
          question: string;
          messageId?: string;
          context?: string;
        };

        // lazy-load context if needed
        let emailContext = context;
        if (messageId && !emailContext) {
          emailContext = await copilot.getEmailContext(messageId);
        }

        // process the question
        const result = await copilot.processQuestion(
          question,
          emailContext
        );

        console.log(`🤖 Copilot processed: ${question}`);
        return NextResponse.json({
          response:   result.response,
          confidence: result.confidence,
          error:      result.error,
          context:    emailContext
        });
      }

      // ─── Just fetch the email context (for previewing) ───────────────────
      case 'get_email_context': {
        const { messageId } = graphReq.data as { messageId?: string };
        if (!messageId) {
          return NextResponse.json(
            { error: 'messageId required' },
            { status: 400 }
          );
        }
        const ctx = await copilot.getEmailContext(messageId);
        console.log(`📧 Context retrieved: ${messageId}`);
        return NextResponse.json({ context: ctx, messageId });
      }

      // ─── Unknown action ───────────────────────────────────────────────────
      default: {
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
      }
    }
  } catch (err: any) {
    console.error('[POST /api/graph] processing error', err);
    return NextResponse.json(
      { error: 'Graph operation failed', message: err.message },
      { status: 500 }
    );
  }
}
