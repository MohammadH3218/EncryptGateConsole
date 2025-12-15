// lib/rag-investigation-assistant.ts
// RAG-Enhanced Investigation Assistant with Evidence Citations

import { getDriver } from './neo4j'
import { getOpenAIApiKey } from './config'

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const LLM_TIMEOUT_MS = 30_000

interface EvidenceContext {
  emailDetails: any
  senderHistory: any[]
  relatedEmails: any[]
  domainReputation: any[]
  urlAnalysis: any[]
  similarCampaigns: any[]
  detections: any[]
}

interface Citation {
  type: 'email' | 'sender_history' | 'domain' | 'url' | 'campaign'
  id: string
  description: string
}

/**
 * Gather comprehensive evidence from Neo4j for a given email
 */
export async function gatherEvidence(messageId: string): Promise<EvidenceContext> {
  const driver = await getDriver()

  try {
    console.log(`📊 Gathering evidence for ${messageId}`)

    // 1. Get email details with sender and recipients
    const emailQuery = `
      MATCH (e:Email {messageId: $messageId})
      OPTIONAL MATCH (s:User)-[:WAS_SENT]->(e)
      OPTIONAL MATCH (e)-[:WAS_SENT_TO]->(r:User)
      OPTIONAL MATCH (e)-[:CONTAINS_URL]->(url:URL)
      OPTIONAL MATCH (url)-[:BELONGS_TO_DOMAIN]->(d:Domain)
      OPTIONAL MATCH (e)-[:TRIGGERED_DETECTION]->(det:Detection)
      RETURN e,
             s.email as sender,
             s.name as senderName,
             s.firstSeen as senderFirstSeen,
             s.emailCount as senderEmailCount,
             collect(DISTINCT r.email) as recipients,
             collect(DISTINCT {
               url: url.url, 
               domain: d.name, 
               vtScore: url.vtScore, 
               isMalicious: url.isMalicious,
               vtVerdict: url.vtVerdict,
               scanned: url.scanned OR url.vtScore IS NOT NULL OR url.vtVerdict IS NOT NULL
             }) as urls,
             collect(DISTINCT {id: det.id, type: det.type, severity: det.severity, confidence: det.confidence}) as detections
    `

    // 2. Get sender history (other emails from same sender)
    const senderHistoryQuery = `
      MATCH (e:Email {messageId: $messageId})
      MATCH (s:User)-[:WAS_SENT]->(e)
      MATCH (s)-[:WAS_SENT]->(otherEmails:Email)
      WHERE otherEmails.messageId <> $messageId
      OPTIONAL MATCH (otherEmails)-[:TRIGGERED_DETECTION]->(det:Detection)
      RETURN otherEmails.messageId as messageId,
             otherEmails.subject as subject,
             otherEmails.timestamp as timestamp,
             otherEmails.threatLevel as threatLevel,
             otherEmails.status as status,
             collect(det.type) as detectionTypes
      ORDER BY otherEmails.timestamp DESC
      LIMIT 10
    `

    // 3. Get related emails (same exact URL or same domain in URLs)
    const relatedEmailsQuery = `
      MATCH (e:Email {messageId: $messageId})
      OPTIONAL MATCH (e)-[:CONTAINS_URL]->(url:URL)
      WITH e, collect(DISTINCT url.url) as emailUrls
      
      // Find emails with same exact URLs (highest priority)
      OPTIONAL MATCH (sameUrlEmail:Email)-[:CONTAINS_URL]->(sameUrl:URL)
      WHERE sameUrlEmail.messageId <> $messageId 
        AND sameUrl.url IN emailUrls
      WITH e, emailUrls, collect(DISTINCT {
        messageId: sameUrlEmail.messageId,
        subject: sameUrlEmail.subject,
        timestamp: sameUrlEmail.timestamp,
        threatLevel: sameUrlEmail.threatLevel,
        sharedUrl: sameUrl.url,
        matchType: 'exact_url'
      }) as exactMatches
      
      // Also find emails with same domain (if domain exists)
      OPTIONAL MATCH (e)-[:CONTAINS_URL]->(url2:URL)-[:BELONGS_TO_DOMAIN]->(d:Domain)
      OPTIONAL MATCH (d)<-[:BELONGS_TO_DOMAIN]-(otherUrl:URL)<-[:CONTAINS_URL]-(domainEmail:Email)
      WHERE domainEmail.messageId <> $messageId
        AND NOT domainEmail.messageId IN [m IN exactMatches WHERE m.messageId IS NOT NULL | m.messageId]
      
      WITH exactMatches, collect(DISTINCT {
        messageId: domainEmail.messageId,
        subject: domainEmail.subject,
        timestamp: domainEmail.timestamp,
        threatLevel: domainEmail.threatLevel,
        sharedDomain: d.name,
        matchType: 'same_domain'
      }) as domainMatches
      
      UNWIND (exactMatches + domainMatches) as match
      WHERE match.messageId IS NOT NULL
      RETURN match.messageId as messageId,
             match.subject as subject,
             match.timestamp as timestamp,
             match.threatLevel as threatLevel,
             match.sharedUrl as sharedUrl,
             match.sharedDomain as sharedDomain,
             match.matchType as matchType
      ORDER BY 
        CASE WHEN match.matchType = 'exact_url' THEN 0 ELSE 1 END,
        match.timestamp DESC
      LIMIT 10
    `

    // 4. Get domain reputation
    const domainReputationQuery = `
      MATCH (e:Email {messageId: $messageId})
      MATCH (e)-[:CONTAINS_URL]->(url:URL)-[:BELONGS_TO_DOMAIN]->(d:Domain)
      RETURN d.name as domain,
             d.firstSeen as firstSeen,
             d.lastSeen as lastSeen,
             d.reputation as reputation,
             d.vtScore as vtScore,
             d.isMalicious as isMalicious,
             d.emailCount as emailCount,
             size((d)<-[:BELONGS_TO_DOMAIN]-()) as totalUrls
      ORDER BY d.emailCount DESC
    `

    // 5. Get similar campaigns
    const campaignQuery = `
      MATCH (e:Email {messageId: $messageId})
      OPTIONAL MATCH (e)-[:PART_OF_CAMPAIGN]->(c:Campaign)
      OPTIONAL MATCH (c)<-[:PART_OF_CAMPAIGN]-(other:Email)
      WHERE other.messageId <> $messageId
      RETURN c.id as campaignId,
             c.name as campaignName,
             c.severity as severity,
             c.emailCount as emailCount,
             count(other) as relatedEmails
    `

    // Execute all queries in parallel using separate sessions to avoid transaction conflicts
    const [emailResult, senderHistory, relatedEmails, domainRep, campaigns] = await Promise.all([
      (async () => {
        const s = driver.session();
        try {
          return await s.run(emailQuery, { messageId });
        } finally {
          await s.close();
        }
      })(),
      (async () => {
        const s = driver.session();
        try {
          return await s.run(senderHistoryQuery, { messageId });
        } finally {
          await s.close();
        }
      })(),
      (async () => {
        const s = driver.session();
        try {
          return await s.run(relatedEmailsQuery, { messageId });
        } finally {
          await s.close();
        }
      })(),
      (async () => {
        const s = driver.session();
        try {
          return await s.run(domainReputationQuery, { messageId });
        } finally {
          await s.close();
        }
      })(),
      (async () => {
        const s = driver.session();
        try {
          return await s.run(campaignQuery, { messageId });
        } finally {
          await s.close();
        }
      })()
    ])

    const emailRecord = emailResult.records[0]?.toObject()

    return {
      emailDetails: emailRecord || {},
      senderHistory: senderHistory.records.map(r => r.toObject()),
      relatedEmails: relatedEmails.records.map(r => r.toObject()),
      domainReputation: domainRep.records.map(r => r.toObject()),
      urlAnalysis: emailRecord?.urls || [],
      similarCampaigns: campaigns.records.map(r => r.toObject()),
      detections: emailRecord?.detections || []
    }
  } catch (error) {
    console.error('❌ Error gathering evidence:', error)
    throw error
  }
}

/**
 * Format evidence into a readable context for the LLM
 */
function formatEvidenceContext(evidence: EvidenceContext): string {
  const sections: string[] = []

  // Email Details
  if (evidence.emailDetails && evidence.emailDetails.e) {
    const email = evidence.emailDetails.e.properties
    const threatScore = email.threatScore || email.final_score || email.riskScore || 0
    const threatLevel = email.threatLevel || email.final_level || 'none'
    const vtVerdict = email.vt_verdict || 'UNKNOWN'
    const isPhishing = email.is_phishing || false
    
    sections.push(`EMAIL DETAILS:
- Message ID: ${email.messageId || 'N/A'}
- Subject: ${email.subject || 'N/A'}
- Sender: ${evidence.emailDetails.sender || 'N/A'}
- Recipients: ${evidence.emailDetails.recipients?.join(', ') || 'N/A'}
- Timestamp: ${email.timestamp || email.sentDate || 'N/A'}
- Threat Score: ${threatScore}/100
- Threat Level: ${threatLevel}
- Status: ${email.status || 'unknown'}
- VirusTotal Verdict: ${vtVerdict}${vtVerdict === 'MALICIOUS' ? ' ⚠️ MALICIOUS' : ''}
- DistilBERT Score: ${email.distilbert_score ? (email.distilbert_score * 100).toFixed(1) + '%' : 'N/A'}
- Phishing Detected: ${isPhishing ? 'YES ⚠️' : 'No'}
${vtVerdict === 'MALICIOUS' ? '\n⚠️ CRITICAL: VirusTotal has flagged this email as MALICIOUS. This is a strong indicator of threat.' : ''}
${threatScore >= 50 ? `\n⚠️ WARNING: Threat score of ${threatScore}/100 indicates ${threatLevel} risk level.` : ''}
`)
  }

  // Sender History
  if (evidence.senderHistory.length > 0) {
    sections.push(`SENDER HISTORY (${evidence.senderHistory.length} previous emails):`)
    evidence.senderHistory.forEach((email, i) => {
      sections.push(`${i + 1}. "${email.subject}" - ${email.timestamp} - Threat: ${email.threatLevel || 'none'} - Status: ${email.status || 'unknown'}`)
      if (email.detectionTypes && email.detectionTypes.length > 0) {
        sections.push(`   Detections: ${email.detectionTypes.join(', ')}`)
      }
    })
    sections.push('')
  } else {
    sections.push('SENDER HISTORY: No previous emails from this sender\n')
  }

  // Related Emails
  if (evidence.relatedEmails.length > 0) {
    sections.push(`RELATED EMAILS (${evidence.relatedEmails.length} emails with similar patterns):`)
    evidence.relatedEmails.forEach((email, i) => {
      sections.push(`${i + 1}. "${email.subject || 'No subject'}" - ${email.timestamp || 'Unknown date'}`)
      if (email.sharedUrl) {
        sections.push(`   Shared URL: ${email.sharedUrl} (exact match)`)
      } else if (email.sharedDomain) {
        sections.push(`   Shared domain: ${email.sharedDomain}`)
      }
      sections.push(`   Match type: ${email.matchType || 'unknown'} - Threat: ${email.threatLevel || 'none'}`)
    })
    sections.push('')
  } else {
    sections.push('RELATED EMAILS: No similar emails found (no shared URLs or domains)\n')
  }

  // Domain Reputation
  if (evidence.domainReputation.length > 0) {
    sections.push(`DOMAIN REPUTATION:`)
    evidence.domainReputation.forEach((domain, i) => {
      sections.push(`${i + 1}. ${domain.domain}`)
      sections.push(`   First seen: ${domain.firstSeen || 'Unknown'}`)
      sections.push(`   Email count: ${domain.emailCount || 0}`)
      sections.push(`   VT Score: ${domain.vtScore !== null ? domain.vtScore : 'Not scanned'}`)
      sections.push(`   Malicious: ${domain.isMalicious ? 'YES' : 'No'}`)
    })
    sections.push('')
  }

  // URL Analysis
  if (evidence.urlAnalysis.length > 0) {
    sections.push(`URL ANALYSIS (${evidence.urlAnalysis.length} URLs found):`)
    evidence.urlAnalysis.forEach((url, i) => {
      if (url.url) {
        sections.push(`${i + 1}. ${url.url}`)
        sections.push(`   Domain: ${url.domain || 'Unknown'}`)
        const scanned = url.scanned || url.vtScore !== null || url.vtVerdict !== null
        if (scanned) {
          sections.push(`   VirusTotal Verdict: ${url.vtVerdict || 'UNKNOWN'}`)
          sections.push(`   VT Score: ${url.vtScore !== null && url.vtScore !== undefined ? url.vtScore : 'N/A'}`)
          sections.push(`   Malicious: ${url.isMalicious ? 'YES ⚠️' : url.vtVerdict === 'MALICIOUS' ? 'YES ⚠️ (VirusTotal)' : 'No'}`)
        } else {
          sections.push(`   VirusTotal Status: Not scanned`)
          sections.push(`   VT Score: Not scanned`)
          sections.push(`   Malicious: Unknown (not scanned)`)
        }
      }
    })
    sections.push('')
  }

  // Campaigns
  if (evidence.similarCampaigns.length > 0 && evidence.similarCampaigns[0].campaignId) {
    sections.push(`CAMPAIGN INFORMATION:`)
    evidence.similarCampaigns.forEach((campaign, i) => {
      if (campaign.campaignId) {
        sections.push(`${i + 1}. Campaign: ${campaign.campaignName || campaign.campaignId}`)
        sections.push(`   Severity: ${campaign.severity || 'Unknown'}`)
        sections.push(`   Total emails: ${campaign.emailCount || 0}`)
        sections.push(`   Related to this email: ${campaign.relatedEmails || 0}`)
      }
    })
    sections.push('')
  }

  // Detections
  if (evidence.detections.length > 0 && evidence.detections[0].id) {
    sections.push(`SECURITY DETECTIONS:`)
    evidence.detections.forEach((det, i) => {
      if (det.id) {
        sections.push(`${i + 1}. ${det.type || 'Unknown'} (${det.severity || 'unknown'} severity)`)
        sections.push(`   Confidence: ${det.confidence ? (det.confidence * 100).toFixed(1) + '%' : 'N/A'}`)
      }
    })
    sections.push('')
  }

  return sections.join('\n')
}

/**
 * Ask investigation question with RAG (evidence-based reasoning)
 */
export async function askInvestigationAssistantWithRAG(
  question: string,
  messageId: string
): Promise<{ answer: string; citations: Citation[] }> {
  try {
    // 1. Gather all evidence from Neo4j
    console.log('📊 Gathering evidence from Neo4j...')
    const evidence = await gatherEvidence(messageId)

    // 2. Format evidence into context
    const evidenceContext = formatEvidenceContext(evidence)

    // 3. Build system prompt with evidence
    // Extract email properties - handle both e.properties structure and direct properties
    const emailProps = evidence.emailDetails?.e?.properties || evidence.emailDetails || {}
    const vtVerdict = emailProps.vt_verdict || 'UNKNOWN'
    const threatScore = emailProps.threatScore || emailProps.final_score || emailProps.riskScore || 0
    const threatLevel = emailProps.threatLevel || emailProps.final_level || 'none'
    
    // Build threat emphasis based on evidence
    let threatEmphasis = ''
    if (vtVerdict === 'MALICIOUS') {
      threatEmphasis = `\n\n⚠️ CRITICAL THREAT INDICATOR: VirusTotal verdict is MALICIOUS. This is a definitive threat indicator that MUST be mentioned when explaining why the email was flagged.`
    }
    if (threatScore >= 50) {
      threatEmphasis += `\n⚠️ HIGH THREAT SCORE: The email has a threat score of ${threatScore}/100 (${threatLevel} risk level). This indicates significant threat indicators were detected.`
    }
    if (evidence.urlAnalysis.some((u: any) => u.isMalicious)) {
      threatEmphasis += `\n⚠️ MALICIOUS URLs: The email contains URLs flagged as malicious by VirusTotal.`
    }
    if (evidence.domainReputation.some((d: any) => d.isMalicious)) {
      threatEmphasis += `\n⚠️ MALICIOUS DOMAINS: The email contains domains flagged as malicious.`
    }
    
    const systemPrompt = `You are an expert SOC analyst assistant for EncryptGate email security platform.

Your job is to answer questions about email investigations using ONLY the evidence provided from the Neo4j graph database.

${evidenceContext}${threatEmphasis}

CRITICAL INSTRUCTIONS:
1. Answer ONLY using the evidence provided above
2. ALWAYS cite specific evidence when making claims (e.g., "According to sender history, ..." or "Based on domain reputation, ...")
3. If VirusTotal verdict is MALICIOUS, you MUST state that the email was flagged because VirusTotal detected malicious content
4. If threat score is 50 or higher, you MUST mention this as a reason for flagging
5. If evidence shows malicious URLs or domains, you MUST mention these as threat indicators
6. If evidence is missing to answer the question, explicitly state what information is not available
7. Be concise but thorough
8. Include confidence levels in your assessments (e.g., "high confidence", "medium confidence", "low confidence")
9. If patterns suggest a threat, explain which specific evidence points support this
10. Format your response in clear sections with bullet points where appropriate
11. Do NOT make assumptions beyond what the evidence shows
12. NEVER say an email was "not flagged" if the evidence shows VirusTotal: MALICIOUS, threat score >= 50, or malicious URLs/domains

RESPONSE FORMAT:
- Start with a direct answer to the question
- If asked "Why was this flagged?", prioritize: VirusTotal verdict, threat score, malicious URLs/domains, then other indicators
- Provide supporting evidence with specific citations
- End with a confidence assessment and any caveats
`.trim()

    const userPrompt = `Question: ${question}`

    // 4. Call OpenAI with evidence-rich context
    const apiKey = await getOpenAIApiKey()
    if (!apiKey) {
      throw new Error('OpenAI API key not available')
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

    try {
      const response = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2,
          max_tokens: 1500
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      const answer = data.choices[0]?.message?.content || 'No response generated'

      // 5. Extract citations (simple version - can be enhanced)
      const citations: Citation[] = []

      if (evidence.senderHistory.length > 0) {
        citations.push({
          type: 'sender_history',
          id: messageId,
          description: `${evidence.senderHistory.length} previous emails from sender`
        })
      }

      if (evidence.relatedEmails.length > 0) {
        citations.push({
          type: 'campaign',
          id: messageId,
          description: `${evidence.relatedEmails.length} related emails found`
        })
      }

      if (evidence.domainReputation.length > 0) {
        evidence.domainReputation.forEach(domain => {
          if (domain.isMalicious) {
            citations.push({
              type: 'domain',
              id: domain.domain,
              description: `Malicious domain: ${domain.domain}`
            })
          }
        })
      }

      return { answer, citations }

    } finally {
      clearTimeout(timeoutId)
    }

  } catch (error: any) {
    console.error('❌ RAG Investigation Assistant error:', error)

    // Fallback response
    return {
      answer: `❌ Error analyzing email: ${error.message}. Please check Neo4j connection and try again.`,
      citations: []
    }
  }
}

/**
 * Quick evidence summary for immediate display
 */
export async function getEvidenceSummary(messageId: string): Promise<string> {
  try {
    const evidence = await gatherEvidence(messageId)

    const summary: string[] = []

    // Quick stats
    summary.push('**Evidence Summary:**')
    summary.push(`• Sender history: ${evidence.senderHistory.length} previous emails`)
    summary.push(`• Related emails: ${evidence.relatedEmails.length} similar patterns`)
    summary.push(`• Domains analyzed: ${evidence.domainReputation.length}`)
    summary.push(`• URLs found: ${evidence.urlAnalysis.length}`)

    // Threats
    const maliciousDomains = evidence.domainReputation.filter(d => d.isMalicious).length
    if (maliciousDomains > 0) {
      summary.push(`• ⚠️ ${maliciousDomains} malicious domain(s) detected`)
    }

    const maliciousUrls = evidence.urlAnalysis.filter(u => u.isMalicious).length
    if (maliciousUrls > 0) {
      summary.push(`• ⚠️ ${maliciousUrls} malicious URL(s) detected`)
    }

    return summary.join('\n')
  } catch (error) {
    console.error('Error getting evidence summary:', error)
    return 'Unable to load evidence summary'
  }
}
