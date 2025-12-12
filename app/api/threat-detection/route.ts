// app/api/threat-detection/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  UpdateItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { z } from 'zod';
import { runMultiAgentThreatDetection } from '@/lib/agents';
import { extractOrgId, TABLES } from '@/lib/aws';

//
// ─── CONFIG ────────────────────────────────────────────────────────────────
//
const REGION             = process.env.AWS_REGION!;
const EMAILS_TABLE       = process.env.EMAILS_TABLE_NAME!;
const DETECTIONS_TABLE   = process.env.DETECTIONS_TABLE_NAME! || TABLES.DETECTIONS;

const ddb = new DynamoDBClient({ region: REGION });

//
// ─── REQUEST VALIDATION ──────────────────────────────────────────────────────
//
const ThreatRequestSchema = z
  .object({
    messageId:  z.string().nonempty(),
    sender:     z.string().email(),
    recipients: z.array(z.string().email()).min(1),
    subject:    z.string().optional().default(''),
    body:       z.string().optional().default(''),
    timestamp:  z
      .string()
      .refine((d) => !isNaN(Date.parse(d)), { message: 'Invalid ISO timestamp' }),
    urls:       z.array(z.string()).optional().default([]),
    direction:  z.enum(['inbound', 'outbound']).optional().default('inbound'),
    senderIP:   z.string().optional(), // Sender IP address for VirusTotal analysis
    attachments: z.array(z.object({
      filename: z.string(),
      mimeType: z.string().optional(),
      buffer:   z.any().optional(), // Buffer data (if available)
      s3Key:    z.string().optional(), // Or S3 key reference
    })).optional().default([]),
  })
  .passthrough(); // allow extra fields

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
  // New fields from multi-agent system
  distilbert_score?: number;
  vt_score?: number;
  context_score?: number;
  model_version?: string;
  vt_verdict?: string;
}

//
// ─── POST: ANALYZE EMAIL THREAT (MULTI-AGENT SYSTEM) ─────────────────────────
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

  console.log(`🔍 [MULTI-AGENT] Analyzing threat for email: ${payload.messageId}`);
  console.log(`   From: ${payload.sender} | To: ${payload.recipients.join(', ')}`);

  try {
    // 2) Run multi-agent threat detection
    const analysis = await analyzeWithMultiAgentSystem(payload);

    // 3) update the original email's threat status
    try {
      await updateEmailThreatStatus(payload.messageId, analysis);
    } catch (err: any) {
      console.error('❌ Failed to update email status', err);
      // but don't abort entirely—still attempt detection creation
    }

    // 4) if a significant threat, create a detection record
    // Only create detections for medium, high, or critical threats (score >= 45)
    if (analysis.threatLevel === 'medium' || analysis.threatLevel === 'high' || analysis.threatLevel === 'critical') {
      try {
        const orgId = extractOrgId(request);
        await createSecurityDetection(payload, analysis, orgId);
      } catch (err: any) {
        console.error('❌ Failed to create detection', err);
      }
    }

    console.log(`✅ Multi-agent analysis complete: ${analysis.threatLevel} (${analysis.threatScore})`);
    console.log(`   DistilBERT: ${(analysis.distilbert_score! * 100).toFixed(1)}% | VT: ${(analysis.vt_score! * 100).toFixed(1)}% | Context: ${(analysis.context_score! * 100).toFixed(1)}%`);

    // 5) return to caller
    return NextResponse.json({ success: true, analysis });
  } catch (err: any) {
    console.error('❌ Threat analysis failed:', err);
    return NextResponse.json(
      { error: 'Threat analysis failed', message: err.message },
      { status: 500 }
    );
  }
}

//
// ─── MULTI-AGENT THREAT ANALYSIS ─────────────────────────────────────────────
//
async function analyzeWithMultiAgentSystem(emailData: ThreatRequest): Promise<ThreatAnalysis> {
  try {
    // Prepare attachment data (if available)
    // Note: In production, you may need to fetch from S3 if only s3Key is provided
    const attachments = (emailData.attachments || [])
      .filter(att => att.buffer)
      .map(att => ({
        buffer: Buffer.isBuffer(att.buffer) ? att.buffer : Buffer.from(att.buffer),
        filename: att.filename,
        mimeType: att.mimeType,
      }));

    // Run multi-agent detection
    const result = await runMultiAgentThreatDetection(
      {
        subject: emailData.subject || '',
        body: emailData.body || '',
        sender: emailData.sender,
        recipients: emailData.recipients,
        urls: emailData.urls || [],
        messageId: emailData.messageId,
        sentDate: emailData.timestamp,
        direction: emailData.direction || 'inbound',
        senderIP: emailData.senderIP, // Pass sender IP for VirusTotal domain/IP analysis
      },
      attachments
    );

    // Convert to ThreatAnalysis format
    const indicators: string[] = [];

    // Add DistilBERT indicators
    if (result.distilbert_result.phish_score > 0.5) {
      const topLabels = result.distilbert_result.labels.slice(0, 3);
      topLabels.forEach(label => {
        if (label.score > 0.3) {
          indicators.push(`DistilBERT: ${label.label} (${(label.score * 100).toFixed(1)}%)`);
        }
      });
    }

    // Add VirusTotal indicators
    if (result.vt_result.aggregate_verdict !== 'CLEAN' && result.vt_result.aggregate_verdict !== 'UNKNOWN') {
      indicators.push(`VirusTotal: ${result.vt_result.aggregate_verdict} (${result.vt_result.attachments_scanned} attachments)`);
    }

    // Add graph context indicators
    result.graph_result.findings.forEach(finding => {
      indicators.push(`Context: ${finding}`);
    });

    // Determine malware and spam flags
    const isMalware = result.vt_result.aggregate_verdict === 'MALICIOUS' ||
                      result.vt_result.aggregate_verdict === 'SUSPICIOUS';

    const isSpam = result.final_score >= 30 && result.final_score < 50 && !result.is_phishing;

    return {
      threatLevel: result.threat_level,
      threatScore: result.final_score,
      isPhishing: result.is_phishing,
      isMalware,
      isSpam,
      indicators,
      reasoning: result.copilot_result.explanation,
      confidence: result.copilot_result.confidence,
      distilbert_score: result.distilbert_score,
      vt_score: result.vt_score,
      context_score: result.context_score,
      model_version: result.model_version,
      vt_verdict: result.vt_result.aggregate_verdict,
    };

  } catch (error: any) {
    console.error('Multi-agent system error:', error);

    // Fallback to neutral assessment on error
    return {
      threatLevel: 'low',
      threatScore: 20,
      isPhishing: false,
      isMalware: false,
      isSpam: false,
      indicators: ['Error in multi-agent analysis'],
      reasoning: `Multi-agent system error: ${error.message}. Manual review recommended.`,
      confidence: 30,
      distilbert_score: 0.2,
      vt_score: 0.2,
      context_score: 0.2,
    };
  }
}

//
// ─── DYNAMO UPDATE HELPERS ────────────────────────────────────────────────────
//
async function updateEmailThreatStatus(
  messageId: string,
  a: ThreatAnalysis
) {
  // Determine flaggedCategory based on threat level
  // 'clean' for low/none threats, 'ai' for suspicious threats
  // Only flag medium, high, or critical threats to reduce false positives
  let flaggedCategory: 'clean' | 'ai' | 'none' = 'none';
  let flaggedSeverity: 'low' | 'medium' | 'high' | 'critical' | undefined = undefined;

  // Only flag if threat level is medium or higher (score >= 45)
  // This prevents low-threat emails from being flagged while still catching suspicious ones
  if (a.threatLevel === 'none' || a.threatLevel === 'low') {
    flaggedCategory = 'clean';
  } else if (a.threatLevel === 'medium' || a.threatLevel === 'high' || a.threatLevel === 'critical') {
    flaggedCategory = 'ai';
    flaggedSeverity = a.threatLevel as 'medium' | 'high' | 'critical';
  }

  // Use the email-helpers to update with correct table structure (userId + receivedAt)
  try {
    const { updateEmailAttributes, findEmailByMessageId } = await import('@/lib/email-helpers');
    
    // Find the email first to get the correct keys
    const emailKey = await findEmailByMessageId(messageId);
    if (!emailKey) {
      console.warn(`⚠️ Email not found for threat status update: ${messageId}`);
      // Fallback: try direct update with orgId + messageId (if table supports it)
      await updateEmailThreatStatusDirect(messageId, a, flaggedCategory, flaggedSeverity);
      return;
    }

    // Update flaggedCategory and severity using the helper
    await updateEmailAttributes(messageId, {
      flaggedCategory,
      flaggedSeverity,
      investigationStatus: flaggedCategory === 'ai' ? 'new' : undefined,
    });

    // Also update threat analysis fields directly
    await updateEmailThreatStatusDirect(messageId, a, flaggedCategory, flaggedSeverity, emailKey);
    
    console.log(`✅ Email threat status updated: ${messageId} - flaggedCategory: ${flaggedCategory}, threatLevel: ${a.threatLevel}`);
  } catch (error: any) {
    console.error('❌ Failed to update email threat status:', error);
    // Try direct update as fallback
    await updateEmailThreatStatusDirect(messageId, a, flaggedCategory, flaggedSeverity);
  }
}

// Direct update function for threat analysis fields
async function updateEmailThreatStatusDirect(
  messageId: string,
  a: ThreatAnalysis,
  flaggedCategory: 'clean' | 'ai' | 'none',
  flaggedSeverity?: 'low' | 'medium' | 'high' | 'critical',
  emailKey?: { userId: string; receivedAt: string }
) {
  // Try to find email if keys not provided
  if (!emailKey) {
    const { findEmailByMessageId } = await import('@/lib/email-helpers');
    emailKey = await findEmailByMessageId(messageId);
  }

  if (emailKey) {
    // Use userId + receivedAt keys (correct table structure)
    const updateExpression = `SET
      threatLevel = :lvl,
      threatScore = :score,
      isPhishing = :phish,
      isMalware = :mal,
      isSpam = :spam,
      threatIndicators = :inds,
      threatReasoning = :reason,
      threatConfidence = :conf,
      analyzedAt = :now,
      distilbert_score = :db_score,
      vt_score = :vt_score,
      context_score = :ctx_score,
      model_version = :model,
      vt_verdict = :vt_verdict,
      flaggedCategory = :flaggedCategory,
      updatedAt = :updatedAt`;

    const expressionValues: any = {
      ':lvl': { S: a.threatLevel },
      ':score': { N: a.threatScore.toString() },
      ':phish': { BOOL: a.isPhishing },
      ':mal': { BOOL: a.isMalware },
      ':spam': { BOOL: a.isSpam },
      ':inds': { S: JSON.stringify(a.indicators) },
      ':reason': { S: a.reasoning },
      ':conf': { N: a.confidence.toString() },
      ':now': { S: new Date().toISOString() },
      ':db_score': { N: (a.distilbert_score ?? 0).toString() },
      ':vt_score': { N: (a.vt_score ?? 0).toString() },
      ':ctx_score': { N: (a.context_score ?? 0).toString() },
      ':model': { S: a.model_version || 'unknown' },
      ':vt_verdict': { S: a.vt_verdict || 'UNKNOWN' },
      ':flaggedCategory': { S: flaggedCategory },
      ':updatedAt': { S: new Date().toISOString() },
    };

    if (flaggedSeverity) {
      expressionValues[':flaggedSeverity'] = { S: flaggedSeverity };
      // Add to update expression
      const updateExpr = updateExpression.replace('updatedAt = :updatedAt', 'flaggedSeverity = :flaggedSeverity, updatedAt = :updatedAt');
      await ddb.send(
        new UpdateItemCommand({
          TableName: EMAILS_TABLE,
          Key: {
            userId: { S: emailKey.userId },
            receivedAt: { S: emailKey.receivedAt },
          },
          UpdateExpression: updateExpr,
          ExpressionAttributeValues: expressionValues,
        })
      );
    } else {
      await ddb.send(
        new UpdateItemCommand({
          TableName: EMAILS_TABLE,
          Key: {
            userId: { S: emailKey.userId },
            receivedAt: { S: emailKey.receivedAt },
          },
          UpdateExpression: updateExpression,
          ExpressionAttributeValues: expressionValues,
        })
      );
    }
  } else {
    // Fallback: try with orgId + messageId (if table supports it)
    console.warn(`⚠️ Email not found by messageId, trying orgId + messageId: ${messageId}`);
    const updateExpression = `SET
      threatLevel = :lvl,
      threatScore = :score,
      isPhishing = :phish,
      isMalware = :mal,
      isSpam = :spam,
      threatIndicators = :inds,
      threatReasoning = :reason,
      threatConfidence = :conf,
      analyzedAt = :now,
      distilbert_score = :db_score,
      vt_score = :vt_score,
      context_score = :ctx_score,
      model_version = :model,
      vt_verdict = :vt_verdict,
      flaggedCategory = :flaggedCategory`;

    const expressionValues: any = {
      ':lvl': { S: a.threatLevel },
      ':score': { N: a.threatScore.toString() },
      ':phish': { BOOL: a.isPhishing },
      ':mal': { BOOL: a.isMalware },
      ':spam': { BOOL: a.isSpam },
      ':inds': { S: JSON.stringify(a.indicators) },
      ':reason': { S: a.reasoning },
      ':conf': { N: a.confidence.toString() },
      ':now': { S: new Date().toISOString() },
      ':db_score': { N: (a.distilbert_score ?? 0).toString() },
      ':vt_score': { N: (a.vt_score ?? 0).toString() },
      ':ctx_score': { N: (a.context_score ?? 0).toString() },
      ':model': { S: a.model_version || 'unknown' },
      ':vt_verdict': { S: a.vt_verdict || 'UNKNOWN' },
      ':flaggedCategory': { S: flaggedCategory },
    };

    try {
      await ddb.send(
        new UpdateItemCommand({
          TableName: EMAILS_TABLE,
          Key: {
            orgId: { S: ORG_ID },
            messageId: { S: messageId },
          },
          UpdateExpression: updateExpression,
          ExpressionAttributeValues: expressionValues,
        })
      );
    } catch (fallbackError: any) {
      console.error('❌ Fallback update also failed:', fallbackError);
      throw fallbackError;
    }
  }
}

async function createSecurityDetection(
  emailData: ThreatRequest,
  a: ThreatAnalysis,
  orgId: string | null
) {
  if (!orgId) {
    console.warn('⚠️ Cannot create detection without orgId');
    return;
  }

  const detectionId = `det-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = new Date().toISOString();

  // Use same structure as manual detections: detectionId + receivedAt as keys
  await ddb.send(
    new PutItemCommand({
      TableName: DETECTIONS_TABLE,
      Item: {
        detectionId:     { S: detectionId },
        receivedAt:      { S: timestamp },
        orgId:           { S: orgId },
        organizationId:   { S: orgId }, // Support both field names for compatibility
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
        createdAt:       { S: timestamp },
        manualFlag:      { BOOL: false }, // AI-flagged, not manual
      },
    })
  );

  console.log(`🚨 Detection created ${detectionId} level=${a.threatLevel} for org=${orgId}`);
}

function generateDetectionName(a: ThreatAnalysis): string {
  if (a.isPhishing) return 'Phishing Attempt Detected';
  if (a.isMalware)  return 'Malware Detection';
  if (a.isSpam)     return 'Spam Message Detected';
  if (a.threatLevel === 'critical') return 'Critical Security Threat';
  if (a.threatLevel === 'high') return 'High-Risk Email Detected';
  return 'Suspicious Email Activity';
}

function generateRecommendations(a: ThreatAnalysis): string[] {
  const recs: string[] = [];
  
  if (a.isPhishing) {
    recs.push('Block sender immediately', 'Notify affected users', 'Review similar emails');
  }
  if (a.isMalware) {
    recs.push('Quarantine attachments', 'Run antivirus scan', 'Check endpoint security');
  }
  if (a.threatLevel === 'high' || a.threatLevel === 'critical') {
    recs.push('Escalate to security team', 'Investigate sender reputation');
  }
  if (a.isSpam) {
    recs.push('Add to spam filter', 'Review sender patterns');
  }
  
  // Always add at least one recommendation
  if (recs.length === 0) {
    recs.push('Monitor for similar patterns', 'Document findings');
  }
  
  return recs;
}