// app/api/threat-detection/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import {
  DynamoDBClient,
  UpdateItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { z } from 'zod';

//
// ─── CONFIG ────────────────────────────────────────────────────────────────
//
const REGION             = process.env.AWS_REGION!;
const FN_NAME            = process.env.THREAT_FN_NAME!;       // e.g. "EncryptGateThreatProcessor"
const ORG_ID             = process.env.ORGANIZATION_ID!;
const EMAILS_TABLE       = process.env.EMAILS_TABLE_NAME!;
const DETECTIONS_TABLE   = process.env.DETECTIONS_TABLE_NAME!;

const lambda = new LambdaClient({ region: REGION });
const ddb    = new DynamoDBClient({ region: REGION });

//
// ─── REQUEST VALIDATION ──────────────────────────────────────────────────────
//
const ThreatRequestSchema = z
  .object({
    messageId:  z.string().nonempty(),
    sender:     z.string().email(),
    recipients: z.array(z.string().email()).min(1),
    subject:    z.string().optional(),
    body:       z.string().optional(),
    timestamp:  z
      .string()
      .refine((d) => !isNaN(Date.parse(d)), { message: 'Invalid ISO timestamp' }),
  })
  .passthrough(); // allow extra fields if Lambda needs them

type ThreatRequest = z.infer<typeof ThreatRequestSchema>;

interface ThreatAnalysis {
  threatLevel: 'none'|'low'|'medium'|'high'|'critical';
  threatScore: number;
  isPhishing:  boolean;
  isMalware:   boolean;
  isSpam:      boolean;
  indicators:  string[];
  reasoning:   string;
  confidence:  number;
}

//
// ─── POST: INVOKE LAMBDA, THEN UPDATE DYNAMODB ───────────────────────────────
//
export async function POST(request: Request) {
  // 1) parse & validate
  let payload: ThreatRequest;
  try {
    payload = ThreatRequestSchema.parse(await request.json());
  } catch (err: any) {
    console.error('[POST /api/threat-detection] invalid request', err);
    return NextResponse.json(
      { error: 'Invalid payload', details: err.errors || err.message },
      { status: 400 }
    );
  }

  // 2) invoke your threat-processor Lambda
  let analysis: ThreatAnalysis;
  try {
    const res = await lambda.send(
      new InvokeCommand({
        FunctionName:   FN_NAME,
        InvocationType: 'RequestResponse',
        Payload:        Buffer.from(JSON.stringify(payload)),
      })
    );

    const raw = res.Payload;
    if (!raw) throw new Error('No payload from Lambda');

    const txt = Buffer.isBuffer(raw) ? raw.toString() : new TextDecoder().decode(raw);
    const body = JSON.parse(txt);
    if (res.FunctionError || !body.success) {
      console.error('❌ Lambda processing error', body);
      throw new Error(body.message || 'Lambda error');
    }

    analysis = body.analysis as ThreatAnalysis;
  } catch (err: any) {
    console.error('[POST /api/threat-detection] Lambda invoke failed', err);
    return NextResponse.json(
      { error: 'Analysis invocation failed', message: err.message },
      { status: 500 }
    );
  }

  // 3) update the original email’s Dynamo record
  try {
    await updateEmailThreatStatus(payload.messageId, analysis);
  } catch (err: any) {
    console.error('❌ Failed to update email status', err);
    // but don’t abort entirely—still attempt detection creation
  }

  // 4) if a threat, create a detection record
  if (analysis.threatLevel !== 'none' && analysis.threatScore > 50) {
    try {
      await createSecurityDetection(payload, analysis);
    } catch (err: any) {
      console.error('❌ Failed to create detection', err);
    }
  }

  // 5) return to caller
  return NextResponse.json({ success: true, analysis });
}

//
// ─── DYNAMO UPDATE HELPERS ────────────────────────────────────────────────────
//
async function updateEmailThreatStatus(
  messageId: string,
  a: ThreatAnalysis
) {
  await ddb.send(
    new UpdateItemCommand({
      TableName: EMAILS_TABLE,
      Key: {
        orgId:     { S: ORG_ID },
        messageId: { S: messageId },
      },
      UpdateExpression:
        `SET threatLevel       = :lvl,
             threatScore       = :score,
             isPhishing        = :phish,
             isMalware         = :mal,
             isSpam            = :spam,
             threatIndicators  = :inds,
             threatReasoning   = :reason,
             threatConfidence  = :conf,
             analyzedAt        = :now`,
      ExpressionAttributeValues: {
        ':lvl':  { S: a.threatLevel },
        ':score':{ N: a.threatScore.toString() },
        ':phish':{ BOOL: a.isPhishing },
        ':mal':  { BOOL: a.isMalware },
        ':spam': { BOOL: a.isSpam },
        ':inds': { S: JSON.stringify(a.indicators) },
        ':reason': { S: a.reasoning },
        ':conf': { N: a.confidence.toString() },
        ':now':  { S: new Date().toISOString() },
      },
    })
  );
}

async function createSecurityDetection(
  emailData: ThreatRequest,
  a: ThreatAnalysis
) {
  const detectionId = `det-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await ddb.send(
    new PutItemCommand({
      TableName: DETECTIONS_TABLE,
      Item: {
        orgId:           { S: ORG_ID },
        detectionId:     { S: detectionId },
        emailMessageId:  { S: emailData.messageId },
        severity:        { S: a.threatLevel },
        name:            { S: generateDetectionName(a) },
        status:          { S: 'new' },
        assignedTo:      { S: '[]' },
        sentBy:          { S: emailData.sender },
        timestamp:       { S: emailData.timestamp },
        description:     { S: a.reasoning },
        indicators:      { S: JSON.stringify(a.indicators) },
        recommendations: { S: JSON.stringify(generateRecommendations(a)) },
        threatScore:     { N: a.threatScore.toString() },
        confidence:      { N: a.confidence.toString() },
        createdAt:       { S: new Date().toISOString() },
      },
    })
  );

  console.log(`🚨 Detection created ${detectionId} level=${a.threatLevel}`);
}

function generateDetectionName(a: ThreatAnalysis): string {
  if (a.isPhishing) return 'Phishing Attempt';
  if (a.isMalware)  return 'Malware Detection';
  if (a.isSpam)     return 'Spam Message';
  return 'Suspicious Email Activity';
}

function generateRecommendations(a: ThreatAnalysis): string[] {
  const recs: string[] = [];
  if (a.isPhishing) {
    recs.push('Block sender immediately', 'Notify affected users', 'Review similar emails');
  }
  if (a.isMalware) {
    recs.push('Quarantine attachments', 'Run AV scan', 'Check endpoint security');
  }
  if (a.threatLevel === 'high' || a.threatLevel === 'critical') {
    recs.push('Escalate to security team', 'Investigate sender reputation');
  }
  return recs;
}
