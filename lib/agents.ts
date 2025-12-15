/**
 * Multi-Agent Architecture for EncryptGate Threat Detection
 *
 * Coordinates:
 * - Agent 1: DistilBERT Classifier
 * - Agent 2: VirusTotal Scanner
 * - Agent 3: Graph Context Analyzer
 * - Agent 4: Copilot Explainer (OpenAI)
 *
 * Final risk is a fusion of all agent signals
 */

import { getConfig } from './config';
import {
  scanFile,
  scanMultipleFiles,
  scanURL,
  verdictToScore,
  aggregateVerdicts,
  analyzeSender,
  scanMultipleDomains,
  extractDomain,
  type VTFileResult,
  type VTURLResult,
  type VTVerdict,
  type VTDomainResult,
  type VTIPResult,
} from './virustotal';
import {
  getGraphContext,
  enrichEmailNode,
  type GraphContextResult,
  type EmailEnrichmentData,
} from './neo4j-enrichment';
import { getOpenAIApiKey } from './config';

// ============================================================================
// Agent 1: DistilBERT Classifier
// ============================================================================

export interface DistilBERTLabel {
  label: string;
  score: number;
}

export interface DistilBERTResult {
  model_version: string;
  labels: DistilBERTLabel[];
  phish_score: number;
  processing_time_ms?: number;
  device_used?: string;
  error?: string;
}

/**
 * Agent 1: DistilBERT Classifier
 *
 * Calls the DistilBERT microservice for email phishing detection
 */
export async function runDistilBERTAgent(
  subject: string,
  body: string,
  urls?: string[]
): Promise<DistilBERTResult> {
  try {
    const config = await getConfig();
    const distilbertUrl = config.DISTILBERT_URL;

    if (!distilbertUrl) {
      console.warn('[Agent 1] ⚠️ DistilBERT URL not configured - check Parameter Store or environment variable');
      console.warn('[Agent 1] Expected Parameter Store path: /encryptgate/distilbert-url');
      return {
        model_version: 'fallback',
        labels: [{ label: 'unknown', score: 0.5 }],
        phish_score: 0.5,
        error: 'DistilBERT service not configured - URL missing',
      };
    }

    console.log('[Agent 1] Calling DistilBERT service...');

    const requestBody = {
      subject,
      body,
      urls: urls || [],
    };

    const response = await fetch(distilbertUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Agent 1] DistilBERT service error (${response.status}): ${errorText}`);

      return {
        model_version: 'error',
        labels: [{ label: 'error', score: 0.5 }],
        phish_score: 0.5,
        error: `Service error: ${response.status}`,
      };
    }

    const result: DistilBERTResult = await response.json();

    console.log(
      `[Agent 1] DistilBERT result - Phish score: ${result.phish_score.toFixed(3)} | ` +
      `Top label: ${result.labels[0]?.label} (${result.labels[0]?.score.toFixed(3)})`
    );

    return result;

  } catch (error: any) {
    console.error('[Agent 1] DistilBERT agent error:', error);

    return {
      model_version: 'error',
      labels: [{ label: 'error', score: 0.5 }],
      phish_score: 0.5,
      error: error.message || 'Unknown error',
    };
  }
}

// ============================================================================
// Agent 2: VirusTotal Scanner
// ============================================================================

export interface VTAgentResult {
  // Attachment scanning
  attachments_scanned: number;
  attachment_verdicts: VTVerdict[];
  attachment_scan_results: VTFileResult[];

  // Domain analysis
  sender_domain_result: VTDomainResult | null;
  url_domain_results: VTDomainResult[];

  // URL scanning (individual URLs)
  url_scan_results: VTURLResult[];

  // IP analysis
  sender_ip_result: VTIPResult | null;

  // Combined results
  aggregate_verdict: VTVerdict;
  vt_score: number;
  verdicts: VTVerdict[]; // All verdicts combined
}

/**
 * Agent 2: VirusTotal Scanner (Enhanced)
 *
 * Comprehensive VirusTotal analysis:
 * - Scans email attachments (hash-first with upload fallback)
 * - Checks sender domain reputation
 * - Checks URL domain reputations
 * - Checks sender IP address (if provided)
 */
export async function runVirusTotalAgent(
  attachments: Array<{ buffer: Buffer; filename: string }>,
  senderEmail: string,
  urls: string[],
  senderIP?: string
): Promise<VTAgentResult> {
  try {
    console.log(`[Agent 2] Running VirusTotal comprehensive analysis...`);
    console.log(`[Agent 2] - Attachments: ${attachments.length}`);
    console.log(`[Agent 2] - URLs to check: ${urls.length}`);
    console.log(`[Agent 2] - Sender IP: ${senderIP || 'Not provided'}`);

    // Always re-scan URLs for security (URLs can change, redirect, or hide malicious content)
    // But use cached results as fallback if scan fails or times out
    let urlScanResults: VTURLResult[] = [];
    if (urls.length > 0) {
      try {
        const { getDriver } = await import('./neo4j');
        const driver = await getDriver();
        const session = driver.session();
        
        // Get cached results as fallback (but we'll still re-scan)
        const cachedResults = new Map<string, VTURLResult>();
        
        for (const url of urls) {
          try {
            const checkQuery = `
              MATCH (urlNode:URL)
              WHERE (urlNode.url = $url OR urlNode.value = $url)
                AND (urlNode.scanned = true OR urlNode.vtVerdict IS NOT NULL OR urlNode.isMalicious = true)
              RETURN urlNode.vtVerdict as verdict, 
                     urlNode.vtScore as score, 
                     urlNode.isMalicious as isMalicious,
                     urlNode.updatedAt as lastScanned
              LIMIT 1
            `;
            const result = await session.run(checkQuery, { url });
            
            if (result.records.length > 0) {
              const record = result.records[0];
              let verdict = record.get('verdict') as string | null;
              const score = record.get('score') as number | null;
              const isMalicious = record.get('isMalicious') as boolean | null;
              
              if (!verdict && isMalicious) {
                verdict = 'MALICIOUS';
              } else if (!verdict) {
                verdict = 'UNKNOWN';
              }
              
              cachedResults.set(url, {
                url,
                verdict: verdict as VTVerdict,
                stats: {
                  malicious: (isMalicious || verdict === 'MALICIOUS') ? 1 : 0,
                  suspicious: verdict === 'SUSPICIOUS' ? 1 : 0,
                  harmless: verdict === 'CLEAN' ? 1 : 0,
                  undetected: 0,
                  timeout: 0,
                },
                permalink: '',
              });
            }
          } catch (checkError) {
            // Continue - we'll scan anyway
            console.warn(`[Agent 2] Error checking Neo4j for URL ${url.substring(0, 50)}:`, checkError);
          }
        }
        
        await session.close();
        
        // Always re-scan all URLs (security best practice - URLs can change)
        // Use cached results only as fallback if scan fails
        console.log(`[Agent 2] Re-scanning ${urls.length} URLs with VirusTotal (security: URLs can change/redirect)...`);
        const scanPromises = urls.map(async (url) => {
          try {
            // Scan with timeout (10 seconds per URL)
            const scanResult = await Promise.race([
              scanURL(url),
              new Promise<VTURLResult>((_, reject) => 
                setTimeout(() => reject(new Error('URL scan timeout')), 10000)
              )
            ]);
            return scanResult;
          } catch (error: any) {
            console.warn(`[Agent 2] URL scan failed/timed out for ${url.substring(0, 50)}:`, error.message);
            // Use cached result as fallback if available
            if (cachedResults.has(url)) {
              console.log(`[Agent 2] Using cached result as fallback for ${url.substring(0, 50)}...`);
              return cachedResults.get(url)!;
            }
            // Return error result if no cache
            return {
              url,
              verdict: 'ERROR' as VTVerdict,
              stats: { harmless: 0, malicious: 0, suspicious: 0, undetected: 0, timeout: 0 },
              permalink: '',
              error: error.message || 'Unknown error',
            };
          }
        });
        
        urlScanResults = await Promise.all(scanPromises);
        console.log(`[Agent 2] URL scanning complete: ${urlScanResults.filter(r => r.verdict !== 'ERROR').length}/${urls.length} successful`);
      } catch (neo4jError) {
        console.warn(`[Agent 2] Error checking Neo4j, scanning all URLs:`, neo4jError);
        // Fallback: scan all URLs
        urlScanResults = await Promise.all(
          urls.map(url => scanURL(url).catch(error => {
            console.error(`[Agent 2] URL scan failed for ${url.substring(0, 50)}:`, error);
            return {
              url,
              verdict: 'ERROR' as VTVerdict,
              stats: { harmless: 0, malicious: 0, suspicious: 0, undetected: 0, timeout: 0 },
              permalink: '',
              error: error.message || 'Unknown error',
            };
          }))
        );
      }
    }

    // Run all checks in parallel for performance
    const [attachmentResults, senderAnalysis, urlDomainResults] = await Promise.all([
      // 1. Scan attachments
      attachments.length > 0
        ? scanMultipleFiles(attachments)
        : Promise.resolve([]),

      // 2. Analyze sender (domain + optional IP)
      analyzeSender(senderEmail, senderIP),

      // 3. Scan URL domains
      urls.length > 0
        ? scanMultipleDomains(urls.map(url => extractDomain(url)).filter(Boolean) as string[])
        : Promise.resolve([]),

      // 4. Scan individual URLs
      urls.length > 0
        ? Promise.all(urls.map(url => scanURL(url)))
        : Promise.resolve([]),
    ]);

    // Collect all verdicts
    const allVerdicts: VTVerdict[] = [];

    // Attachment verdicts
    const attachmentVerdicts = attachmentResults.map(r => r.verdict);
    allVerdicts.push(...attachmentVerdicts);

    // Sender domain verdict
    if (senderAnalysis.domain) {
      allVerdicts.push(senderAnalysis.domain.verdict);
    }

    // Sender IP verdict
    if (senderAnalysis.ip) {
      allVerdicts.push(senderAnalysis.ip.verdict);
    }

    // URL domain verdicts
    const urlDomainVerdicts = urlDomainResults.map(r => r.verdict);
    allVerdicts.push(...urlDomainVerdicts);

    // Individual URL verdicts
    const urlVerdicts = urlScanResults.map(r => r.verdict);
    allVerdicts.push(...urlVerdicts);

    // Compute aggregate verdict and score
    const aggregateVerdict = allVerdicts.length > 0
      ? aggregateVerdicts(allVerdicts)
      : 'CLEAN';
    const vtScore = verdictToScore(aggregateVerdict);

    const maliciousCount = allVerdicts.filter(v => v === 'MALICIOUS').length;
    const suspiciousCount = allVerdicts.filter(v => v === 'SUSPICIOUS').length;

    console.log(
      `[Agent 2] VT analysis complete - Verdict: ${aggregateVerdict} | ` +
      `Score: ${vtScore.toFixed(2)} | ` +
      `${maliciousCount} malicious, ${suspiciousCount} suspicious ` +
      `(${attachmentResults.length} files, ${urlScanResults.length} URLs, ${urlDomainResults.length} domains, ` +
      `${senderAnalysis.domain ? '1 sender domain' : '0 sender'}, ` +
      `${senderAnalysis.ip ? '1 IP' : '0 IP'})`
    );

    return {
      // Attachment results
      attachments_scanned: attachments.length,
      // URL scan results
      url_scan_results: urlScanResults,
      attachment_verdicts: attachmentVerdicts,
      attachment_scan_results: attachmentResults,

      // Domain results
      sender_domain_result: senderAnalysis.domain,
      url_domain_results: urlDomainResults,

      // IP results
      sender_ip_result: senderAnalysis.ip,

      // Combined results
      aggregate_verdict: aggregateVerdict,
      vt_score: vtScore,
      verdicts: allVerdicts,
    };

  } catch (error: any) {
    console.error('[Agent 2] VirusTotal agent error:', error);

    return {
      attachments_scanned: attachments.length,
      attachment_verdicts: ['ERROR'],
      attachment_scan_results: [],
      sender_domain_result: null,
      url_domain_results: [],
      sender_ip_result: null,
      aggregate_verdict: 'ERROR',
      vt_score: 0.2, // Uncertainty penalty
      verdicts: ['ERROR'],
    };
  }
}

// ============================================================================
// Agent 3: Graph Context Analyzer
// ============================================================================

export interface GraphAgentResult extends GraphContextResult {
  // Inherits all fields from GraphContextResult
}

/**
 * Agent 3: Graph Context Analyzer
 *
 * Analyzes sender/recipient relationships using Neo4j
 * Detects anomalies and historical patterns
 */
export async function runGraphContextAgent(
  sender: string,
  recipients: string[],
  messageId?: string
): Promise<GraphAgentResult> {
  try {
    console.log('[Agent 3] Analyzing graph context...');

    const context = await getGraphContext(sender, recipients, messageId);

    console.log(
      `[Agent 3] Graph analysis complete - Context score: ${context.context_score.toFixed(3)} | ` +
      `Findings: ${context.findings.length}`
    );

    return context;

  } catch (error: any) {
    console.error('[Agent 3] Graph context agent error:', error);

    return {
      context_score: 0.2, // Uncertainty penalty
      is_first_time_sender: false,
      is_first_time_communication: false,
      sender_email_count: 0,
      sender_incident_count: 0,
      domain_risk_score: 0,
      findings: ['Error retrieving graph context'],
    };
  }
}

// ============================================================================
// Agent 4: Copilot Explainer (OpenAI)
// ============================================================================

export interface CopilotExplanation {
  explanation: string;
  recommended_actions: string[];
  cypher_queries?: string[];
  confidence: number;
}

/**
 * Agent 4: Copilot Explainer
 *
 * Uses OpenAI to generate explanations based on deterministic results
 * Does NOT make detection decisions - only explains existing results
 */
export async function runCopilotAgent(
  emailData: {
    subject: string;
    body: string;
    sender: string;
    recipients: string[];
  },
  distilbertResult: DistilBERTResult,
  vtResult: VTAgentResult,
  graphResult: GraphAgentResult,
  finalScore: number,
  finalLevel: string
): Promise<CopilotExplanation> {
  try {
    console.log('[Agent 4] Generating Copilot explanation...');

    const apiKey = await getOpenAIApiKey();
    if (!apiKey) {
      console.warn('[Agent 4] OpenAI API key not available');
      return {
        explanation: 'Copilot explanation unavailable (API key not configured)',
        recommended_actions: [],
        confidence: 0,
      };
    }

    // Build context from all agent results
    const context = {
      email: {
        subject: emailData.subject,
        sender: emailData.sender,
        recipients: emailData.recipients,
        body_preview: emailData.body.substring(0, 500),
      },
      distilbert: {
        phish_score: distilbertResult.phish_score,
        top_labels: distilbertResult.labels.slice(0, 3),
        model_version: distilbertResult.model_version,
      },
      virustotal: {
        attachments_scanned: vtResult.attachments_scanned,
        verdict: vtResult.aggregate_verdict,
        vt_score: vtResult.vt_score,
      },
      graph_context: {
        context_score: graphResult.context_score,
        is_first_time_sender: graphResult.is_first_time_sender,
        is_first_time_communication: graphResult.is_first_time_communication,
        findings: graphResult.findings,
      },
      final_assessment: {
        score: finalScore,
        level: finalLevel,
      },
    };

    const systemPrompt = `You are EncryptGate Copilot, an AI assistant for email threat analysis.

Your role is to EXPLAIN threat detection results to security analysts, NOT to make detection decisions.

You receive deterministic results from:
1. DistilBERT phishing model (ML-based classification)
2. VirusTotal malware scanner (attachment analysis)
3. Neo4j graph analyzer (relationship and anomaly detection)

Your job:
- Explain WHY the email received this threat score
- Highlight key indicators from each detection agent
- Recommend next investigation steps
- Optionally suggest Neo4j Cypher queries for deeper investigation

IMPORTANT:
- Do NOT invent or guess at indicators not present in the data
- Do NOT make new threat assessments - only explain the provided results
- Keep explanations concise and actionable
- Focus on facts, not speculation`;

    const userPrompt = `Explain the threat assessment for this email:

${JSON.stringify(context, null, 2)}

Provide:
1. A brief explanation (2-3 sentences) of why this threat level was assigned
2. Recommended investigation actions (if threat level is MEDIUM or higher)
3. Optional Cypher queries for Neo4j investigation (if relevant)`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      console.error(`[Agent 4] OpenAI API error: ${response.status}`);
      return {
        explanation: 'Copilot explanation unavailable (API error)',
        recommended_actions: [],
        confidence: 0,
      };
    }

    const data = await response.json();
    const explanation = data.choices?.[0]?.message?.content || 'No explanation generated';

    console.log('[Agent 4] Copilot explanation generated');

    // Parse explanation for structured output
    // (This is a simple implementation - could be enhanced with JSON mode)
    const recommendedActions: string[] = [];

    // Extract action items (simple pattern matching)
    const actionMatches = explanation.match(/- (.*?)(?:\n|$)/g);
    if (actionMatches) {
      actionMatches.forEach((match: string) => {
        const action = match.replace(/^- /, '').trim();
        if (action.length > 10) {
          recommendedActions.push(action);
        }
      });
    }

    return {
      explanation,
      recommended_actions: recommendedActions,
      confidence: 85, // High confidence since based on deterministic inputs
    };

  } catch (error: any) {
    console.error('[Agent 4] Copilot agent error:', error);

    return {
      explanation: `Copilot explanation unavailable: ${error.message}`,
      recommended_actions: [],
      confidence: 0,
    };
  }
}

// ============================================================================
// Risk Fusion Logic
// ============================================================================

export interface FusedThreatAssessment {
  // Scores from each agent
  distilbert_score: number;
  vt_score: number;
  context_score: number;

  // Final risk assessment
  final_score: number; // 0-100
  threat_level: 'none' | 'low' | 'medium' | 'high' | 'critical';
  is_phishing: boolean;

  // Agent results
  distilbert_result: DistilBERTResult;
  vt_result: VTAgentResult;
  graph_result: GraphAgentResult;
  copilot_result: CopilotExplanation;

  // Metadata
  model_version: string;
  timestamp: string;
}

/**
 * Fuse signals from all agents into final threat assessment
 *
 * Weighting:
 * - DistilBERT: 55%
 * - VirusTotal: 35%
 * - Graph Context: 10%
 */
export function fuseRiskScores(
  distilbertScore: number,
  vtScore: number,
  contextScore: number
): { finalScore: number; threatLevel: string } {
  // Weighted fusion
  const finalScore = (
    0.55 * distilbertScore +
    0.35 * vtScore +
    0.10 * contextScore
  );

  // Clamp to [0, 1]
  const clampedScore = Math.min(Math.max(finalScore, 0), 1);

  // Convert to 0-100 scale
  const scoreOutOf100 = Math.round(clampedScore * 100);

  // Determine threat level
  // Adjusted thresholds: require higher scores for medium+ to reduce false positives
  // But still allow flagging of suspicious emails
  let threatLevel: string;
  if (scoreOutOf100 < 20) {
    threatLevel = 'none';
  } else if (scoreOutOf100 < 45) {
    threatLevel = 'low';
  } else if (scoreOutOf100 < 70) {
    threatLevel = 'medium';
  } else if (scoreOutOf100 < 85) {
    threatLevel = 'high';
  } else {
    threatLevel = 'critical';
  }

  return {
    finalScore: scoreOutOf100,
    threatLevel,
  };
}

/**
 * Orchestrate all agents and fuse results
 *
 * This is the main entry point for the multi-agent threat detection
 */
export async function runMultiAgentThreatDetection(
  emailData: {
    subject: string;
    body: string;
    sender: string;
    recipients: string[];
    urls: string[];
    messageId: string;
    sentDate: string;
    direction: 'inbound' | 'outbound';
    senderIP?: string; // Optional sender IP address
  },
  attachments: Array<{ buffer: Buffer; filename: string; mimeType?: string }> = []
): Promise<FusedThreatAssessment> {
  console.log('=== MULTI-AGENT THREAT DETECTION START ===');
  console.log(`Email: ${emailData.subject} | From: ${emailData.sender}`);

  const startTime = Date.now();

  // Run all agents in parallel for performance
  const [distilbertResult, vtResult, graphResult] = await Promise.all([
    runDistilBERTAgent(emailData.subject, emailData.body, emailData.urls),
    runVirusTotalAgent(attachments, emailData.sender, emailData.urls, emailData.senderIP),
    runGraphContextAgent(emailData.sender, emailData.recipients, emailData.messageId),
  ]);

  // Check if any URLs are malicious - this should significantly boost threat score
  const hasMaliciousUrl = vtResult.url_scan_results?.some(r => 
    r.verdict === 'MALICIOUS' || r.verdict === 'SUSPICIOUS'
  ) || false;
  
  // Fuse risk scores
  let { finalScore, threatLevel } = fuseRiskScores(
    distilbertResult.phish_score,
    vtResult.vt_score,
    graphResult.context_score
  );

  // If any URL is malicious, boost the threat score significantly
  if (hasMaliciousUrl) {
    const maliciousUrlCount = vtResult.url_scan_results?.filter(r => r.verdict === 'MALICIOUS').length || 0;
    const suspiciousUrlCount = vtResult.url_scan_results?.filter(r => r.verdict === 'SUSPICIOUS').length || 0;
    
    // Boost score: +30 for malicious URLs, +15 for suspicious URLs
    const urlBoost = (maliciousUrlCount * 30) + (suspiciousUrlCount * 15);
    finalScore = Math.min(100, finalScore + urlBoost);
    
    // Update threat level based on boosted score
    if (finalScore >= 85) {
      threatLevel = 'critical';
    } else if (finalScore >= 70) {
      threatLevel = 'high';
    } else if (finalScore >= 45) {
      threatLevel = 'medium';
    } else if (finalScore >= 20) {
      threatLevel = 'low';
    } else {
      threatLevel = 'none';
    }
    
    console.log(`[Multi-Agent] URL threat boost applied: +${urlBoost} points (${maliciousUrlCount} malicious, ${suspiciousUrlCount} suspicious URLs)`);
  }

  const isPhishing = finalScore >= 50 || hasMaliciousUrl;

  // Run Copilot agent for explanation (sequential, after fusion)
  const copilotResult = await runCopilotAgent(
    emailData,
    distilbertResult,
    vtResult,
    graphResult,
    finalScore,
    threatLevel
  );

  const processingTime = Date.now() - startTime;

  console.log('=== MULTI-AGENT DETECTION COMPLETE ===');
  console.log(`Final Score: ${finalScore}/100 | Level: ${threatLevel.toUpperCase()}`);
  console.log(`DistilBERT: ${(distilbertResult.phish_score * 100).toFixed(1)}% | VT: ${(vtResult.vt_score * 100).toFixed(1)}% | Context: ${(graphResult.context_score * 100).toFixed(1)}%`);
  console.log(`Processing Time: ${processingTime}ms`);

  const assessment: FusedThreatAssessment = {
    distilbert_score: distilbertResult.phish_score,
    vt_score: vtResult.vt_score,
    context_score: graphResult.context_score,
    final_score: finalScore,
    threat_level: threatLevel as any,
    is_phishing: isPhishing,
    distilbert_result: distilbertResult,
    vt_result: vtResult,
    graph_result: graphResult,
    copilot_result: copilotResult,
    model_version: distilbertResult.model_version,
    timestamp: new Date().toISOString(),
  };

  // Enrich Neo4j with detection results (async, don't wait)
  enrichEmailNode({
    messageId: emailData.messageId,
    subject: emailData.subject,
    body: emailData.body,
    sender: emailData.sender,
    recipients: emailData.recipients,
    urls: emailData.urls,
    url_scan_results: vtResult.url_scan_results?.map(r => ({
      url: r.url,
      verdict: r.verdict,
      stats: r.stats,
    })) || [],
    direction: emailData.direction,
    sentDate: emailData.sentDate,
    distilbert_score: distilbertResult.phish_score,
    distilbert_labels: JSON.stringify(distilbertResult.labels),
    vt_verdict: vtResult.aggregate_verdict,
    final_score: finalScore,
    final_level: threatLevel,
    is_phishing: isPhishing,
    model_version: distilbertResult.model_version,
    attachments: attachments.map(a => ({
      filename: a.filename,
      sha256: 'pending', // Will be computed by VirusTotal
      mimeType: a.mimeType,
    })),
  }).catch(error => {
    console.error('[Agents] Error enriching Neo4j:', error);
  });

  return assessment;
}
