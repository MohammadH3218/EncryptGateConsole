// lib/risk-scoring.ts - ML-based risk scoring for email investigations
import { getDriver } from './neo4j'

/**
 * Risk factors and weights
 */
const RISK_WEIGHTS = {
  // Sender risk factors
  newSender: 15,                      // First time sender
  lowVolumeHistory: 10,               // Sender has sent < 5 emails
  suspiciousEmailCount: 25,           // Sender has flagged emails
  maliciousHistory: 40,               // Sender has confirmed malicious emails
  externalDomain: 5,                  // External/unknown domain

  // Content risk factors
  hasAttachments: 10,                 // Has attachments
  suspiciousAttachmentTypes: 20,      // .exe, .scr, .zip, .js, etc.
  hasURLs: 5,                         // Contains URLs
  suspiciousDomains: 25,              // Known bad domains
  typosquatting: 30,                  // Domain typosquatting detected

  // Behavioral risk factors
  unusualRecipientCount: 15,          // Recipient count unusual for sender
  afterHoursEmail: 5,                 // Sent outside business hours
  rapidFireSequence: 20,              // Part of rapid email sequence
  crossOrganizational: 10,            // Sent to multiple orgs

  // Campaign risk factors
  partOfCampaign: 15,                 // Similar emails sent to multiple
  campaignSize: 10,                   // Size of campaign multiplier

  // Language/content analysis
  urgencyLanguage: 15,                // Urgency words detected
  financialRequest: 25,               // Requests money/credentials
  impersonationAttempt: 35,           // Impersonation detected
  socialEngineering: 20,              // Social engineering tactics
}

export interface RiskScore {
  total: number                       // 0-100
  level: 'low' | 'medium' | 'high' | 'critical'
  confidence: 'low' | 'medium' | 'high'
  factors: RiskFactor[]
  recommendations: string[]
  timestamp: string
}

export interface RiskFactor {
  factor: string
  score: number
  weight: number
  evidence: any
  description: string
}

/**
 * Calculate comprehensive risk score for an email
 */
export async function calculateRiskScore(
  emailId: string,
  emailData?: any
): Promise<RiskScore> {
  const factors: RiskFactor[] = []
  const recommendations: string[] = []

  try {
    const driver = await getDriver()
    const session = driver.session()

    // Get email and sender data
    const emailQuery = `
      MATCH (sender:User)-[:WAS_SENT]->(email:Email {messageId: $emailId})
      OPTIONAL MATCH (email)-[:WAS_SENT_TO]->(recipient:User)
      OPTIONAL MATCH (email)-[:CONTAINS_URL]->(url:URL)
      OPTIONAL MATCH (sender)-[:WAS_SENT]->(otherEmails:Email)
      OPTIONAL MATCH (sender)-[:WAS_SENT]->(flaggedEmails:Email)
        WHERE flaggedEmails.flagged = true OR flaggedEmails.malicious = true

      RETURN
        email,
        sender,
        collect(DISTINCT recipient) AS recipients,
        collect(DISTINCT url) AS urls,
        count(DISTINCT otherEmails) AS senderEmailCount,
        count(DISTINCT flaggedEmails) AS flaggedCount,
        collect(DISTINCT otherEmails.sentDate)[0..10] AS recentDates
    `

    const result = await session.run(emailQuery, { emailId })
    await session.close()

    if (result.records.length === 0) {
      return {
        total: 0,
        level: 'low',
        confidence: 'low',
        factors: [],
        recommendations: ['Email not found in database'],
        timestamp: new Date().toISOString()
      }
    }

    const record = result.records[0].toObject()
    const email = record.email.properties
    const sender = record.sender.properties
    const recipients = record.recipients
    const urls = record.urls
    const senderEmailCount = record.senderEmailCount.toNumber()
    const flaggedCount = record.flaggedCount.toNumber()

    // === Sender Risk Analysis ===

    // New sender
    if (senderEmailCount === 1) {
      factors.push({
        factor: 'newSender',
        score: RISK_WEIGHTS.newSender,
        weight: 1.0,
        evidence: { senderEmailCount },
        description: 'First email from this sender'
      })
      recommendations.push('Verify sender identity through alternative channels')
    }

    // Low volume history
    if (senderEmailCount < 5 && senderEmailCount > 1) {
      factors.push({
        factor: 'lowVolumeHistory',
        score: RISK_WEIGHTS.lowVolumeHistory,
        weight: 0.7,
        evidence: { senderEmailCount },
        description: 'Sender has very limited email history'
      })
    }

    // Previous suspicious emails
    if (flaggedCount > 0) {
      const weight = Math.min(flaggedCount / 5, 1.0)
      factors.push({
        factor: 'suspiciousEmailCount',
        score: RISK_WEIGHTS.suspiciousEmailCount,
        weight,
        evidence: { flaggedCount },
        description: `Sender has ${flaggedCount} previously flagged emails`
      })
      recommendations.push('Review sender\'s email history for patterns')
    }

    // External domain check
    const senderDomain = sender.email?.split('@')[1]
    if (!senderDomain || !isInternalDomain(senderDomain)) {
      factors.push({
        factor: 'externalDomain',
        score: RISK_WEIGHTS.externalDomain,
        weight: 0.5,
        evidence: { domain: senderDomain },
        description: 'Email from external domain'
      })
    }

    // === Content Risk Analysis ===

    // Attachments
    if (email.hasAttachment || emailData?.attachments?.length > 0) {
      factors.push({
        factor: 'hasAttachments',
        score: RISK_WEIGHTS.hasAttachments,
        weight: 0.6,
        evidence: { hasAttachment: true },
        description: 'Email contains attachments'
      })

      // Suspicious attachment types
      const attachments = emailData?.attachments || []
      const suspiciousExts = ['.exe', '.scr', '.bat', '.cmd', '.js', '.vbs', '.ps1', '.dll']
      const hasSuspiciousAttachment = attachments.some((att: any) =>
        suspiciousExts.some(ext => att.filename?.toLowerCase().endsWith(ext))
      )

      if (hasSuspiciousAttachment) {
        factors.push({
          factor: 'suspiciousAttachmentTypes',
          score: RISK_WEIGHTS.suspiciousAttachmentTypes,
          weight: 1.0,
          evidence: { attachments },
          description: 'Contains suspicious file types'
        })
        recommendations.push('Quarantine and analyze attachments in sandbox environment')
      }
    }

    // URLs
    if (urls.length > 0) {
      factors.push({
        factor: 'hasURLs',
        score: RISK_WEIGHTS.hasURLs,
        weight: 0.4,
        evidence: { urlCount: urls.length },
        description: `Contains ${urls.length} URLs`
      })

      // Check for suspicious domains
      const suspiciousDomains = urls.filter((u: any) =>
        isSuspiciousDomain(u.properties.domain)
      )

      if (suspiciousDomains.length > 0) {
        factors.push({
          factor: 'suspiciousDomains',
          score: RISK_WEIGHTS.suspiciousDomains,
          weight: 1.0,
          evidence: { suspiciousDomains },
          description: 'Contains known suspicious domains'
        })
        recommendations.push('Block URLs and warn recipients')
      }
    }

    // === Behavioral Analysis ===

    // Unusual recipient count
    const avgRecipientCount = await getAverageSenderRecipients(sender.email)
    if (avgRecipientCount > 0 && recipients.length > avgRecipientCount * 3) {
      factors.push({
        factor: 'unusualRecipientCount',
        score: RISK_WEIGHTS.unusualRecipientCount,
        weight: 0.8,
        evidence: { recipients: recipients.length, average: avgRecipientCount },
        description: 'Recipient count significantly higher than sender average'
      })
    }

    // Cross-organizational
    const recipientDomains = new Set(recipients.map((r: any) =>
      r.properties.email?.split('@')[1]
    ))
    if (recipientDomains.size > 3) {
      factors.push({
        factor: 'crossOrganizational',
        score: RISK_WEIGHTS.crossOrganizational,
        weight: 0.7,
        evidence: { domainCount: recipientDomains.size },
        description: 'Sent to multiple organizations'
      })
    }

    // === Calculate Total Score ===

    let totalScore = 0
    let totalWeight = 0

    for (const factor of factors) {
      totalScore += factor.score * factor.weight
      totalWeight += factor.weight
    }

    // Normalize to 0-100
    const normalizedScore = Math.min(Math.round(totalScore), 100)

    // Determine risk level
    let level: 'low' | 'medium' | 'high' | 'critical'
    if (normalizedScore < 25) level = 'low'
    else if (normalizedScore < 50) level = 'medium'
    else if (normalizedScore < 75) level = 'high'
    else level = 'critical'

    // Determine confidence
    let confidence: 'low' | 'medium' | 'high'
    if (factors.length < 3) confidence = 'low'
    else if (factors.length < 6) confidence = 'medium'
    else confidence = 'high'

    // Add level-specific recommendations
    if (level === 'critical') {
      recommendations.push('IMMEDIATE ACTION: Quarantine email and block sender')
      recommendations.push('Notify all recipients to not interact with this email')
      recommendations.push('Escalate to security team for incident response')
    } else if (level === 'high') {
      recommendations.push('Quarantine email and investigate further')
      recommendations.push('Consider blocking sender domain')
    } else if (level === 'medium') {
      recommendations.push('Monitor sender and review with analyst')
    }

    return {
      total: normalizedScore,
      level,
      confidence,
      factors,
      recommendations,
      timestamp: new Date().toISOString()
    }

  } catch (error) {
    console.error('Risk scoring error:', error)
    return {
      total: 0,
      level: 'low',
      confidence: 'low',
      factors: [],
      recommendations: ['Error calculating risk score'],
      timestamp: new Date().toISOString()
    }
  }
}

/**
 * Helper: Check if domain is internal
 */
function isInternalDomain(domain: string): boolean {
  const internalDomains = process.env.INTERNAL_DOMAINS?.split(',') || []
  return internalDomains.some(internal => domain.endsWith(internal))
}

/**
 * Helper: Check if domain is suspicious
 */
function isSuspiciousDomain(domain: string): boolean {
  // Add your suspicious domain logic here
  // Could integrate with threat intelligence feeds
  const knownBadPatterns = [
    'bit.ly', 'tinyurl.com', // URL shorteners
    '.tk', '.ml', '.ga',     // Free TLDs
  ]

  return knownBadPatterns.some(pattern => domain.includes(pattern))
}

/**
 * Helper: Get average recipient count for sender
 */
async function getAverageSenderRecipients(senderEmail: string): Promise<number> {
  try {
    const driver = await getDriver()
    const session = driver.session()

    const result = await session.run(
      `MATCH (s:User {email: $email})-[:WAS_SENT]->(e:Email)-[:WAS_SENT_TO]->(r:User)
       RETURN avg(size((e)-[:WAS_SENT_TO]->())) AS avgRecipients`,
      { email: senderEmail }
    )

    await session.close()

    if (result.records.length > 0) {
      const avg = result.records[0].get('avgRecipients')
      return avg ? Math.round(avg) : 0
    }

    return 0
  } catch (error) {
    return 0
  }
}

/**
 * Analyze email content for language-based risks
 */
export function analyzeContentRisk(subject: string, body: string): RiskFactor[] {
  const factors: RiskFactor[] = []
  const content = (subject + ' ' + body).toLowerCase()

  // Urgency language
  const urgencyWords = ['urgent', 'immediate', 'asap', 'critical', 'expires', 'deadline', 'now', 'today']
  const urgencyCount = urgencyWords.filter(word => content.includes(word)).length

  if (urgencyCount >= 2) {
    factors.push({
      factor: 'urgencyLanguage',
      score: RISK_WEIGHTS.urgencyLanguage,
      weight: Math.min(urgencyCount / 4, 1.0),
      evidence: { urgencyWords: urgencyCount },
      description: 'Contains urgency language'
    })
  }

  // Financial requests
  const financialWords = ['wire', 'transfer', 'payment', 'invoice', 'paypal', 'bank account', 'routing number', 'password', 'credentials']
  const financialCount = financialWords.filter(word => content.includes(word)).length

  if (financialCount >= 2) {
    factors.push({
      factor: 'financialRequest',
      score: RISK_WEIGHTS.financialRequest,
      weight: Math.min(financialCount / 3, 1.0),
      evidence: { financialWords: financialCount },
      description: 'Contains financial or credential requests'
    })
  }

  // Impersonation attempt
  const impersonationWords = ['ceo', 'cfo', 'president', 'executive', 'boss', 'manager', 'on behalf of']
  const impersonationCount = impersonationWords.filter(word => content.includes(word)).length

  if (impersonationCount >= 1) {
    factors.push({
      factor: 'impersonationAttempt',
      score: RISK_WEIGHTS.impersonationAttempt,
      weight: 0.8,
      evidence: { impersonationIndicators: impersonationCount },
      description: 'Possible impersonation attempt'
    })
  }

  return factors
}
