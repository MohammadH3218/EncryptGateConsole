// app/api/threat-detection/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
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
const ORG_ID             = process.env.ORGANIZATION_ID!;
const EMAILS_TABLE       = process.env.EMAILS_TABLE_NAME!;
const DETECTIONS_TABLE   = process.env.DETECTIONS_TABLE_NAME!;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;
const OPENROUTER_MODEL   = process.env.OPENROUTER_MODEL || 'mistralai/mixtral-8x7b-instruct';
const OPENROUTER_URL     = 'https://openrouter.ai/api/v1/chat/completions';

const ddb = new DynamoDBClient({ region: REGION });

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
    urls:       z.array(z.string()).optional(),
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
}

//
// ─── THREAT ANALYSIS SYSTEM PROMPT ───────────────────────────────────────────
//
const THREAT_ANALYSIS_PROMPT = `You are an advanced email security analyst. Analyze the provided email content and metadata to determine potential threats.

Consider these factors:
1. Sender reputation and domain analysis
2. Subject line patterns (urgency, typos, suspicious claims)
3. Email body content (phishing indicators, malicious links, social engineering)
4. URL analysis (suspicious domains, URL shorteners, typosquatting)
5. Context and timing patterns

Respond with a JSON object containing:
{
  "threatLevel": "none|low|medium|high|critical",
  "threatScore": 0-100,
  "isPhishing": boolean,
  "isMalware": boolean,
  "isSpam": boolean,
  "indicators": ["list", "of", "threat", "indicators"],
  "reasoning": "detailed explanation of the analysis",
  "confidence": 0-100
}

Be thorough but avoid false positives for legitimate business emails.`;

//
// ─── POST: ANALYZE EMAIL THREAT ──────────────────────────────────────────────
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

  console.log(`🔍 Analyzing threat for email: ${payload.messageId}`);

  try {
    // 2) perform threat analysis using LLM
    const analysis = await analyzeThreatWithLLM(payload);
    
    // 3) update the original email's threat status
    try {
      await updateEmailThreatStatus(payload.messageId, analysis);
    } catch (err: any) {
      console.error('❌ Failed to update email status', err);
      // but don't abort entirely—still attempt detection creation
    }

    // 4) if a significant threat, create a detection record
    if (analysis.threatLevel !== 'none' && analysis.threatScore > 30) {
      try {
        await createSecurityDetection(payload, analysis);
      } catch (err: any) {
        console.error('❌ Failed to create detection', err);
      }
    }

    console.log(`✅ Threat analysis complete: ${analysis.threatLevel} (${analysis.threatScore})`);
    
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
// ─── LLM-BASED THREAT ANALYSIS ───────────────────────────────────────────────
//
async function analyzeThreatWithLLM(emailData: ThreatRequest): Promise<ThreatAnalysis> {
  const emailContent = `
Email Analysis Request:

Sender: ${emailData.sender}
Recipients: ${emailData.recipients.join(', ')}
Subject: ${emailData.subject || 'No Subject'}
Timestamp: ${emailData.timestamp}

Body:
${emailData.body || 'No body content'}

URLs Found:
${emailData.urls?.join('\n') || 'No URLs detected'}

Please analyze this email for security threats and respond with the requested JSON format.
`;

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: THREAT_ANALYSIS_PROMPT },
          { role: 'user', content: emailContent },
        ],
        temperature: 0.1, // Low temperature for consistent analysis
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    
    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid LLM response format');
    }

    const analysisResult = JSON.parse(jsonMatch[0]);
    
    // Validate and sanitize the response
    return {
      threatLevel: analysisResult.threatLevel || 'low',
      threatScore: Math.min(100, Math.max(0, analysisResult.threatScore || 10)),
      isPhishing: Boolean(analysisResult.isPhishing),
      isMalware: Boolean(analysisResult.isMalware),
      isSpam: Boolean(analysisResult.isSpam),
      indicators: Array.isArray(analysisResult.indicators) ? analysisResult.indicators : [],
      reasoning: analysisResult.reasoning || 'Automated threat analysis completed',
      confidence: Math.min(100, Math.max(0, analysisResult.confidence || 50)),
    };
  } catch (error) {
    console.error('LLM analysis error:', error);
    
    // Fallback to rule-based analysis
    return fallbackThreatAnalysis(emailData);
  }
}

//
// ─── FALLBACK RULE-BASED ANALYSIS ────────────────────────────────────────────
//
function fallbackThreatAnalysis(emailData: ThreatRequest): ThreatAnalysis {
  const suspiciousKeywords = [
    'urgent', 'immediate action', 'verify account', 'suspended',
    'click here', 'update payment', 'confirm identity', 'tax refund',
    'prize', 'winner', 'congratulations', 'limited time', 'act now'
  ];

  const phishingDomains = [
    'bit.ly', 'tinyurl.com', 'goo.gl', 't.co' // URL shorteners
  ];

  let threatScore = 0;
  const indicators: string[] = [];
  let isPhishing = false;
  let isSpam = false;

  const subject = emailData.subject?.toLowerCase() || '';
  const body = emailData.body?.toLowerCase() || '';
  const urls = emailData.urls || [];

  // Check for suspicious keywords
  suspiciousKeywords.forEach(keyword => {
    if (subject.includes(keyword) || body.includes(keyword)) {
      threatScore += 15;
      indicators.push(`Suspicious keyword: ${keyword}`);
    }
  });

  // Check sender domain
  const senderDomain = emailData.sender.split('@')[1];
  if (senderDomain && (senderDomain.includes('temp') || senderDomain.includes('fake'))) {
    threatScore += 25;
    indicators.push('Suspicious sender domain');
  }

  // Check URLs
  urls.forEach(url => {
    phishingDomains.forEach(domain => {
      if (url.includes(domain)) {
        threatScore += 20;
        indicators.push('URL shortener detected');
        isPhishing = true;
      }
    });
  });

  // Urgency indicators
  if (subject.includes('urgent') || subject.includes('immediate')) {
    threatScore += 10;
    indicators.push('Urgency language detected');
  }

  // Determine threat level
  let threatLevel: ThreatAnalysis['threatLevel'] = 'none';
  if (threatScore >= 70) threatLevel = 'critical';
  else if (threatScore >= 50) threatLevel = 'high';
  else if (threatScore >= 30) threatLevel = 'medium';
  else if (threatScore >= 10) threatLevel = 'low';

  return {
    threatLevel,
    threatScore: Math.min(100, threatScore),
    isPhishing,
    isMalware: false, // Basic analysis doesn't detect malware
    isSpam: isSpam || threatScore >= 20,
    indicators,
    reasoning: 'Automated rule-based analysis completed due to LLM unavailability',
    confidence: 60, // Lower confidence for rule-based analysis
  };
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