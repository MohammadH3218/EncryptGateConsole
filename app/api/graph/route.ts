// app/api/graph/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { z } from 'zod';

//
// ─── CONFIG ────────────────────────────────────────────────────────────────────
//
const REGION   = process.env.AWS_REGION!;
const FN_NAME  = process.env.GRAPH_FN_NAME!; // e.g. "EncryptGateGraphProcessor"

const lambda = new LambdaClient({ region: REGION });

//
// ─── VALIDATION ────────────────────────────────────────────────────────────────
//
const GraphRequestSchema = z.object({
  action: z.enum(['add_email','query_copilot','get_email_context']),
  data:   z.any(),
});
type GraphRequest = z.infer<typeof GraphRequestSchema>;

//
// ─── POST: HAND OFF TO LAMBDA ──────────────────────────────────────────────────
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

  // 3) invoke your Lambda
  try {
    const invokeRes = await lambda.send(new InvokeCommand({
      FunctionName:   FN_NAME,
      InvocationType: 'RequestResponse', // wait for result
      Payload:        Buffer.from(JSON.stringify(graphReq)),
    }));

    // 4) decode Lambda’s response payload
    const raw = invokeRes.Payload;
    let parsed: any = {};
    if (raw) {
      const str = Buffer.isBuffer(raw) ? raw.toString() : new TextDecoder().decode(raw);
      try { parsed = JSON.parse(str); }
      catch { parsed = { result: str }; }
    }

    // 5) forward status code and body
    const statusCode = invokeRes.FunctionError ? 500 : (parsed.statusCode || 200);
    const body       = parsed.body ? JSON.parse(parsed.body) : parsed;

    return NextResponse.json(body, { status: statusCode });
  } catch (err: any) {
    console.error('[POST /api/graph] lambda invoke error', err);
    return NextResponse.json(
      { error: 'Failed to invoke graph processor', message: err.message },
      { status: 500 }
    );
  }
}
