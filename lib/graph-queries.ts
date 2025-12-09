/**
 * Graph Query Functions
 * Structured Cypher queries for common email security investigations
 */

import { ensureNeo4jConnection } from './neo4j';

export interface SenderRelationshipResult {
  sender: string;
  emails: Array<{
    messageId: string;
    subject: string;
    sentAt: string;
    recipients: string[];
    severity?: string;
  }>;
  recipientCount: number;
  emailCount: number;
}

export interface SimilarIncidentResult {
  emailId: string;
  messageId: string;
  subject: string;
  sender: string;
  sentAt: string;
  similarityScore?: number;
  sharedAttributes: {
    sender?: boolean;
    domain?: boolean;
    urls?: string[];
  };
}

export interface HighRiskDomainResult {
  domain: string;
  emailCount: number;
  highSeverityCount: number;
  criticalSeverityCount: number;
  uniqueSenders: number;
}

/**
 * Get sender relationship graph
 * Returns all emails sent by a sender and their recipients
 */
export async function getSenderRelationships(
  senderEmail: string,
  timeRange?: string,
  minSeverity?: string
): Promise<SenderRelationshipResult> {
  const neo4j = await ensureNeo4jConnection();

  // Calculate time range
  let timeFilter = '';
  if (timeRange) {
    const days = parseInt(timeRange.replace('d', '')) || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    timeFilter = `AND e.sentDate >= '${cutoffDate.toISOString()}'`;
  }

  // Severity filter (if emails have severity property)
  let severityFilter = '';
  if (minSeverity) {
    const severityMap: Record<string, string[]> = {
      critical: ['critical'],
      high: ['critical', 'high'],
      medium: ['critical', 'high', 'medium'],
      low: ['critical', 'high', 'medium', 'low'],
    };
    const allowedSeverities = severityMap[minSeverity] || [];
    if (allowedSeverities.length > 0) {
      severityFilter = `AND e.severity IN [${allowedSeverities.map(s => `'${s}'`).join(', ')}]`;
    }
  }

  const query = `
    MATCH (sender:User {email: $senderEmail})-[:WAS_SENT]->(e:Email)
    ${timeFilter}
    ${severityFilter}
    OPTIONAL MATCH (e)-[:WAS_SENT_TO]->(recipient:User)
    WITH sender, e, collect(recipient.email) AS recipients
    WITH sender, collect({
      messageId: e.messageId,
      subject: e.subject,
      sentAt: e.sentDate,
      recipients: recipients,
      severity: e.severity
    }) AS emails,
    size(collect(e)) AS emailCount,
    [email IN collect(e) | size((email)-[:WAS_SENT_TO]->())] AS recipientCounts
    RETURN sender.email AS sender,
           emails,
           emailCount,
           reduce(total = 0, count IN recipientCounts | total + count) AS recipientCount
    LIMIT 1
  `;

  try {
    const results = await neo4j.runQuery(query, { senderEmail });
    if (results.length === 0) {
      return {
        sender: senderEmail,
        emails: [],
        recipientCount: 0,
        emailCount: 0,
      };
    }

    const result = results[0];
    return {
      sender: result.sender || senderEmail,
      emails: result.emails || [],
      recipientCount: result.recipientCount || 0,
      emailCount: result.emailCount || 0,
    };
  } catch (error: any) {
    console.error('Error querying sender relationships:', error);
    throw new Error(`Failed to query sender relationships: ${error.message}`);
  }
}

/**
 * Find similar incidents to a given email
 * Looks for emails with same sender, domain, or shared URLs
 */
export async function findSimilarIncidents(
  emailId: string
): Promise<SimilarIncidentResult[]> {
  const neo4j = await ensureNeo4jConnection();

  // First, get the email details
  const emailQuery = `
    MATCH (e:Email {messageId: $emailId})
    OPTIONAL MATCH (sender:User)-[:WAS_SENT]->(e)
    OPTIONAL MATCH (e)-[:CONTAINS_URL]->(url:URL)
    RETURN e.messageId AS messageId,
           e.subject AS subject,
           sender.email AS sender,
           e.sentDate AS sentAt,
           collect(url.url) AS urls
    LIMIT 1
  `;

  const emailResults = await neo4j.runQuery(emailQuery, { emailId });
  if (emailResults.length === 0) {
    return [];
  }

  const email = emailResults[0];
  const sender = email.sender;
  const domain = sender ? sender.split('@')[1] : null;
  const urls = email.urls || [];

  // Find similar emails
  let similarQuery = `
    MATCH (target:Email {messageId: $emailId})
    OPTIONAL MATCH (targetSender:User)-[:WAS_SENT]->(target)
    OPTIONAL MATCH (target)-[:CONTAINS_URL]->(targetUrl:URL)
    
    WITH target, targetSender, collect(targetUrl.url) AS targetUrls
    
    MATCH (other:Email)
    WHERE other.messageId <> $emailId
    OPTIONAL MATCH (otherSender:User)-[:WAS_SENT]->(other)
    OPTIONAL MATCH (other)-[:CONTAINS_URL]->(otherUrl:URL)
    
    WITH target, targetSender, targetUrls, other, otherSender, collect(otherUrl.url) AS otherUrls
    
    WHERE (targetSender IS NOT NULL AND otherSender IS NOT NULL AND targetSender.email = otherSender.email)
       OR (size(targetUrls) > 0 AND size(otherUrls) > 0 AND any(url IN targetUrls WHERE url IN otherUrls))
    
    RETURN other.messageId AS emailId,
           other.messageId AS messageId,
           other.subject AS subject,
           otherSender.email AS sender,
           other.sentDate AS sentAt,
           {
             sender: (targetSender.email = otherSender.email),
             domain: (targetSender.email IS NOT NULL AND otherSender.email IS NOT NULL AND 
                      split(targetSender.email, '@')[1] = split(otherSender.email, '@')[1]),
             urls: [url IN otherUrls WHERE url IN targetUrls]
           } AS sharedAttributes
    ORDER BY other.sentDate DESC
    LIMIT 20
  `;

  try {
    const results = await neo4j.runQuery(similarQuery, { emailId });
    return results.map((r: any) => ({
      emailId: r.emailId || r.messageId,
      messageId: r.messageId,
      subject: r.subject || '',
      sender: r.sender || '',
      sentAt: r.sentAt || '',
      sharedAttributes: r.sharedAttributes || {},
    }));
  } catch (error: any) {
    console.error('Error finding similar incidents:', error);
    throw new Error(`Failed to find similar incidents: ${error.message}`);
  }
}

/**
 * Get high-risk domains
 * Returns domains with high/critical severity emails
 */
export async function getHighRiskDomains(
  days: number = 30
): Promise<HighRiskDomainResult[]> {
  const neo4j = await ensureNeo4jConnection();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const query = `
    MATCH (sender:User)-[:WAS_SENT]->(e:Email)
    WHERE e.sentDate >= $cutoffDate
      AND (e.severity IN ['high', 'critical'] OR e.severity IS NULL)
    WITH split(sender.email, '@')[1] AS domain, e, sender
    WHERE domain IS NOT NULL
    WITH domain, 
         count(e) AS emailCount,
         sum(CASE WHEN e.severity = 'high' THEN 1 ELSE 0 END) AS highSeverityCount,
         sum(CASE WHEN e.severity = 'critical' THEN 1 ELSE 0 END) AS criticalSeverityCount,
         collect(DISTINCT sender.email) AS senders
    RETURN domain,
           emailCount,
           highSeverityCount,
           criticalSeverityCount,
           size(senders) AS uniqueSenders
    ORDER BY (highSeverityCount + criticalSeverityCount * 2) DESC, emailCount DESC
    LIMIT 20
  `;

  try {
    const results = await neo4j.runQuery(query, {
      cutoffDate: cutoffDate.toISOString(),
    });
    return results.map((r: any) => ({
      domain: r.domain,
      emailCount: r.emailCount || 0,
      highSeverityCount: r.highSeverityCount || 0,
      criticalSeverityCount: r.criticalSeverityCount || 0,
      uniqueSenders: r.uniqueSenders || 0,
    }));
  } catch (error: any) {
    console.error('Error querying high-risk domains:', error);
    throw new Error(`Failed to query high-risk domains: ${error.message}`);
  }
}

/**
 * Get campaign relationships
 * Find emails that are part of the same campaign/incident
 */
export async function getCampaignEmails(
  emailId: string
): Promise<Array<{ messageId: string; subject: string; sender: string; sentAt: string }>> {
  const neo4j = await ensureNeo4jConnection();

  const query = `
    MATCH (e:Email {messageId: $emailId})-[:PART_OF_CAMPAIGN]->(incident:Incident)<-[:PART_OF_CAMPAIGN]-(other:Email)
    OPTIONAL MATCH (sender:User)-[:WAS_SENT]->(other)
    RETURN other.messageId AS messageId,
           other.subject AS subject,
           sender.email AS sender,
           other.sentDate AS sentAt
    ORDER BY other.sentDate DESC
    LIMIT 50
  `;

  try {
    const results = await neo4j.runQuery(query, { emailId });
    return results.map((r: any) => ({
      messageId: r.messageId,
      subject: r.subject || '',
      sender: r.sender || '',
      sentAt: r.sentAt || '',
    }));
  } catch (error: any) {
    // If PART_OF_CAMPAIGN relationship doesn't exist, return empty
    if (error.message?.includes('PART_OF_CAMPAIGN')) {
      return [];
    }
    console.error('Error querying campaign emails:', error);
    throw new Error(`Failed to query campaign emails: ${error.message}`);
  }
}

