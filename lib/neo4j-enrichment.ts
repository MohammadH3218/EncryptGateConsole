/**
 * Neo4j Graph Enrichment Service
 *
 * Enhanced schema and enrichment queries for EncryptGate threat detection
 * Provides graph-based context and anomaly detection
 */

import { getDriver } from './neo4j';
import type { Session } from 'neo4j-driver';

export interface GraphContextResult {
  context_score: number; // 0..1 (0 = safe, 1 = suspicious)
  is_first_time_sender: boolean;
  is_first_time_communication: boolean;
  sender_email_count: number;
  sender_incident_count: number;
  domain_risk_score: number;
  findings: string[];
}

export interface EmailEnrichmentData {
  messageId: string;
  subject: string;
  body: string;
  sender: string;
  recipients: string[];
  urls: string[];
  url_scan_results?: Array<{
    url: string;
    verdict: string;
    stats?: {
      malicious: number;
      suspicious: number;
      harmless: number;
    };
  }>;
  attachments?: Array<{
    filename: string;
    sha256: string;
    mimeType?: string;
  }>;
  direction: 'inbound' | 'outbound';
  sentDate: string;
  // Threat detection results
  distilbert_score?: number;
  distilbert_labels?: string;
  vt_verdict?: string;
  final_score?: number;
  final_level?: string;
  is_phishing?: boolean;
  model_version?: string;
}

/**
 * Create or update Email node with enriched threat intelligence
 */
export async function enrichEmailNode(data: EmailEnrichmentData): Promise<void> {
  const driver = await getDriver();
  const session: Session = driver.session();

  try {
    console.log(`[Neo4j] Enriching email node: ${data.messageId}`);

    // Extract domain from sender
    const senderDomain = data.sender.split('@')[1] || 'unknown';

    // Create/update Email node with all properties
    const emailQuery = `
      MERGE (email:Email {messageId: $messageId})
      SET email.subject = $subject,
          email.body = $body,
          email.sentDate = $sentDate,
          email.direction = $direction,
          email.updatedAt = datetime(),
          email.distilbert_score = $distilbert_score,
          email.distilbert_labels = $distilbert_labels,
          email.vt_verdict = $vt_verdict,
          email.final_score = $final_score,
          email.final_level = $final_level,
          email.is_phishing = $is_phishing,
          email.model_version = $model_version
      SET email.createdAt = coalesce(email.createdAt, datetime())
      RETURN email.messageId as id
    `;

    await session.run(emailQuery, {
      messageId: data.messageId,
      subject: data.subject,
      body: data.body,
      sentDate: data.sentDate,
      direction: data.direction,
      distilbert_score: data.distilbert_score ?? null,
      distilbert_labels: data.distilbert_labels ?? null,
      vt_verdict: data.vt_verdict ?? null,
      final_score: data.final_score ?? null,
      final_level: data.final_level ?? null,
      is_phishing: data.is_phishing ?? null,
      model_version: data.model_version ?? null,
    });

    // Create/update sender User node
    const senderQuery = `
      MERGE (user:User {email: $email})
      SET user.updatedAt = datetime()
      SET user.createdAt = coalesce(user.createdAt, datetime())
      RETURN user.email as email
    `;

    await session.run(senderQuery, { email: data.sender });

    // Create/update sender Domain node
    const domainQuery = `
      MERGE (domain:Domain {name: $name})
      SET domain.updatedAt = datetime()
      SET domain.createdAt = coalesce(domain.createdAt, datetime())
      RETURN domain.name as name
    `;

    await session.run(domainQuery, { name: senderDomain });

    // Create relationships: (User)-[:SENT]->(Email)
    const sentRelQuery = `
      MATCH (user:User {email: $sender})
      MATCH (email:Email {messageId: $messageId})
      MERGE (user)-[r:SENT]->(email)
      SET r.timestamp = $sentDate
      RETURN r
    `;

    await session.run(sentRelQuery, {
      sender: data.sender,
      messageId: data.messageId,
      sentDate: data.sentDate,
    });

    // Create relationships: (Email)-[:FROM_DOMAIN]->(Domain)
    const fromDomainQuery = `
      MATCH (email:Email {messageId: $messageId})
      MATCH (domain:Domain {name: $domainName})
      MERGE (email)-[r:FROM_DOMAIN]->(domain)
      RETURN r
    `;

    await session.run(fromDomainQuery, {
      messageId: data.messageId,
      domainName: senderDomain,
    });

    // Create recipient relationships: (Email)-[:TO]->(User)
    for (const recipient of data.recipients) {
      // Create recipient User node
      await session.run(senderQuery, { email: recipient });

      // Create TO relationship
      const toRelQuery = `
        MATCH (email:Email {messageId: $messageId})
        MATCH (user:User {email: $recipient})
        MERGE (email)-[r:TO]->(user)
        SET r.timestamp = $sentDate
        RETURN r
      `;

      await session.run(toRelQuery, {
        messageId: data.messageId,
        recipient: recipient,
        sentDate: data.sentDate,
      });
    }

    // Create URL nodes and relationships
    for (const url of data.urls) {
      // Extract domain from URL
      let urlDomain = 'unknown';
      try {
        const urlObj = new URL(url);
        urlDomain = urlObj.hostname;
      } catch (e) {
        console.warn(`[Neo4j] Invalid URL: ${url}`);
      }

      // Find URL scan result if available
      const urlScanResult = data.url_scan_results?.find(r => r.url === url);
      const vtVerdict = urlScanResult?.verdict || null;
      const vtScore = urlScanResult?.stats 
        ? (urlScanResult.stats.malicious > 0 ? 100 : 
           urlScanResult.stats.suspicious > 0 ? 50 : 0)
        : null;
      const isMalicious = vtVerdict === 'MALICIOUS' || vtVerdict === 'SUSPICIOUS';
      const scanned = urlScanResult !== undefined;

      // Create URL node with VirusTotal data
      const urlQuery = `
        MERGE (url:URL {url: $url})
        SET url.domain = $domain,
            url.updatedAt = datetime(),
            url.vtVerdict = $vtVerdict,
            url.vtScore = $vtScore,
            url.isMalicious = $isMalicious,
            url.scanned = $scanned
        SET url.createdAt = coalesce(url.createdAt, datetime())
        RETURN url.url as url
      `;

      await session.run(urlQuery, { 
        url, 
        domain: urlDomain,
        vtVerdict,
        vtScore,
        isMalicious,
        scanned
      });

      // Create Domain node for URL
      await session.run(domainQuery, { name: urlDomain });

      // Create relationship: (Email)-[:MENTIONS_URL]->(URL)
      const mentionsUrlQuery = `
        MATCH (email:Email {messageId: $messageId})
        MATCH (url:URL {url: $url})
        MERGE (email)-[r:MENTIONS_URL]->(url)
        RETURN r
      `;

      await session.run(mentionsUrlQuery, {
        messageId: data.messageId,
        url: url,
      });

      // Create relationship: (URL)-[:BELONGS_TO_DOMAIN]->(Domain) (using standard relationship name)
      const urlDomainQuery = `
        MATCH (url:URL {url: $url})
        MATCH (domain:Domain {name: $domainName})
        MERGE (url)-[r:BELONGS_TO_DOMAIN]->(domain)
        RETURN r
      `;

      await session.run(urlDomainQuery, {
        url: url,
        domainName: urlDomain,
      });
    }

    // Create Attachment nodes and relationships
    if (data.attachments && data.attachments.length > 0) {
      for (const attachment of data.attachments) {
        // Create Attachment node
        const attachmentQuery = `
          MERGE (att:Attachment {sha256: $sha256})
          SET att.filename = $filename,
              att.mimeType = $mimeType,
              att.updatedAt = datetime()
          SET att.createdAt = coalesce(att.createdAt, datetime())
          RETURN att.sha256 as sha256
        `;

        await session.run(attachmentQuery, {
          sha256: attachment.sha256,
          filename: attachment.filename,
          mimeType: attachment.mimeType || 'application/octet-stream',
        });

        // Create relationship: (Email)-[:HAS_ATTACHMENT]->(Attachment)
        const hasAttachmentQuery = `
          MATCH (email:Email {messageId: $messageId})
          MATCH (att:Attachment {sha256: $sha256})
          MERGE (email)-[r:HAS_ATTACHMENT]->(att)
          SET r.filename = $filename
          RETURN r
        `;

        await session.run(hasAttachmentQuery, {
          messageId: data.messageId,
          sha256: attachment.sha256,
          filename: attachment.filename,
        });
      }
    }

    console.log(`[Neo4j] Successfully enriched email: ${data.messageId}`);

  } catch (error) {
    console.error(`[Neo4j] Error enriching email node:`, error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Get graph-based context for threat detection
 *
 * Analyzes sender/recipient relationships and domain history
 * Returns anomaly signals and context score
 */
export async function getGraphContext(
  sender: string,
  recipients: string[],
  messageId?: string
): Promise<GraphContextResult> {
  const driver = await getDriver();
  const session: Session = driver.session();

  const result: GraphContextResult = {
    context_score: 0,
    is_first_time_sender: false,
    is_first_time_communication: false,
    sender_email_count: 0,
    sender_incident_count: 0,
    domain_risk_score: 0,
    findings: [],
  };

  try {
    console.log(`[Neo4j] Getting graph context for sender: ${sender}`);

    const senderDomain = sender.split('@')[1] || 'unknown';

    // 1. Check if sender exists (first-time sender)
    const senderExistsQuery = `
      MATCH (user:User {email: $sender})
      RETURN count(user) as count
    `;

    const senderExistsResult = await session.run(senderExistsQuery, { sender });
    const senderExists = senderExistsResult.records[0]?.get('count')?.toNumber() > 0;

    if (!senderExists) {
      result.is_first_time_sender = true;
      result.findings.push('First-time sender (never seen before)');
      result.context_score += 0.3;
    }

    // 2. Count total emails from sender
    const senderEmailCountQuery = `
      MATCH (user:User {email: $sender})-[:SENT]->(email:Email)
      RETURN count(email) as count
    `;

    const senderEmailCountResult = await session.run(senderEmailCountQuery, { sender });
    result.sender_email_count = senderEmailCountResult.records[0]?.get('count')?.toNumber() || 0;

    if (result.sender_email_count === 0 && !result.is_first_time_sender) {
      result.findings.push('Sender exists but no previous emails sent');
    } else if (result.sender_email_count > 0) {
      result.findings.push(`Sender has sent ${result.sender_email_count} previous emails`);
    }

    // 3. Check for first-time communication with each recipient
    for (const recipient of recipients) {
      const firstTimeCommunicationQuery = `
        MATCH (sender:User {email: $sender})-[:SENT]->(email:Email)-[:TO]->(recipient:User {email: $recipient})
        RETURN count(email) as count
      `;

      const firstTimeResult = await session.run(firstTimeCommunicationQuery, {
        sender,
        recipient,
      });

      const communicationCount = firstTimeResult.records[0]?.get('count')?.toNumber() || 0;

      if (communicationCount === 0) {
        result.is_first_time_communication = true;
        result.findings.push(`First-time communication between ${sender} and ${recipient}`);
        result.context_score += 0.2;
      }
    }

    // 4. Check sender domain for previous phishing incidents
    const domainIncidentQuery = `
      MATCH (domain:Domain {name: $domain})<-[:FROM_DOMAIN]-(email:Email)
      WHERE email.is_phishing = true
      RETURN count(email) as count
    `;

    const domainIncidentResult = await session.run(domainIncidentQuery, {
      domain: senderDomain,
    });

    result.sender_incident_count = domainIncidentResult.records[0]?.get('count')?.toNumber() || 0;

    if (result.sender_incident_count > 0) {
      result.findings.push(
        `Domain ${senderDomain} has ${result.sender_incident_count} previous phishing incidents`
      );
      result.domain_risk_score = Math.min(result.sender_incident_count * 0.1, 1.0);
      result.context_score += result.domain_risk_score * 0.5;
    }

    // 5. Check for suspicious domain patterns (e.g., disposable, newly registered)
    const suspiciousDomainPatterns = [
      '.tk', '.ml', '.ga', '.cf', '.gq', // Free TLDs
      'temp', 'disposable', 'throwaway', '10minute',
    ];

    const hasSuspiciousDomain = suspiciousDomainPatterns.some(pattern =>
      senderDomain.toLowerCase().includes(pattern)
    );

    if (hasSuspiciousDomain) {
      result.findings.push(`Sender domain ${senderDomain} matches suspicious patterns`);
      result.context_score += 0.4;
    }

    // 6. Clamp context_score to [0, 1]
    result.context_score = Math.min(Math.max(result.context_score, 0), 1);

    console.log(
      `[Neo4j] Graph context score: ${result.context_score.toFixed(3)} | ` +
      `Findings: ${result.findings.length}`
    );

    return result;

  } catch (error) {
    console.error(`[Neo4j] Error getting graph context:`, error);
    // Return neutral context on error
    return {
      context_score: 0.2, // Small uncertainty penalty
      is_first_time_sender: false,
      is_first_time_communication: false,
      sender_email_count: 0,
      sender_incident_count: 0,
      domain_risk_score: 0,
      findings: ['Error retrieving graph context'],
    };
  } finally {
    await session.close();
  }
}

/**
 * Get related emails from same sender
 */
export async function getRelatedEmailsFromSender(
  sender: string,
  limit: number = 10
): Promise<any[]> {
  const driver = await getDriver();
  const session: Session = driver.session();

  try {
    const query = `
      MATCH (user:User {email: $sender})-[:SENT]->(email:Email)
      RETURN email.messageId as messageId,
             email.subject as subject,
             email.sentDate as sentDate,
             email.is_phishing as isPhishing,
             email.final_score as finalScore
      ORDER BY email.sentDate DESC
      LIMIT $limit
    `;

    const result = await session.run(query, { sender, limit });
    return result.records.map(r => r.toObject());

  } catch (error) {
    console.error(`[Neo4j] Error getting related emails:`, error);
    return [];
  } finally {
    await session.close();
  }
}

/**
 * Get domain statistics for risk assessment
 */
export async function getDomainStats(domain: string): Promise<any> {
  const driver = await getDriver();
  const session: Session = driver.session();

  try {
    const query = `
      MATCH (domain:Domain {name: $domain})<-[:FROM_DOMAIN]-(email:Email)
      RETURN count(email) as totalEmails,
             sum(CASE WHEN email.is_phishing = true THEN 1 ELSE 0 END) as phishingEmails,
             avg(email.final_score) as avgThreatScore
    `;

    const result = await session.run(query, { domain });

    if (result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    return {
      domain,
      totalEmails: record.get('totalEmails')?.toNumber() || 0,
      phishingEmails: record.get('phishingEmails')?.toNumber() || 0,
      avgThreatScore: record.get('avgThreatScore') || 0,
    };

  } catch (error) {
    console.error(`[Neo4j] Error getting domain stats:`, error);
    return null;
  } finally {
    await session.close();
  }
}

/**
 * Get URLs associated with an email
 */
export async function getEmailURLs(messageId: string): Promise<string[]> {
  const driver = await getDriver();
  const session: Session = driver.session();

  try {
    const query = `
      MATCH (email:Email {messageId: $messageId})-[:MENTIONS_URL]->(url:URL)
      RETURN url.url as url
    `;

    const result = await session.run(query, { messageId });
    return result.records.map(r => r.get('url'));

  } catch (error) {
    console.error(`[Neo4j] Error getting email URLs:`, error);
    return [];
  } finally {
    await session.close();
  }
}

/**
 * Create constraints and indexes for optimal performance
 */
export async function createSchemaConstraints(): Promise<void> {
  const driver = await getDriver();
  const session: Session = driver.session();

  try {
    console.log('[Neo4j] Creating schema constraints and indexes...');

    // Unique constraints (also create indexes)
    const constraints = [
      'CREATE CONSTRAINT user_email_unique IF NOT EXISTS FOR (u:User) REQUIRE u.email IS UNIQUE',
      'CREATE CONSTRAINT email_messageId_unique IF NOT EXISTS FOR (e:Email) REQUIRE e.messageId IS UNIQUE',
      'CREATE CONSTRAINT domain_name_unique IF NOT EXISTS FOR (d:Domain) REQUIRE d.name IS UNIQUE',
      'CREATE CONSTRAINT url_url_unique IF NOT EXISTS FOR (u:URL) REQUIRE u.url IS UNIQUE',
      'CREATE CONSTRAINT attachment_sha256_unique IF NOT EXISTS FOR (a:Attachment) REQUIRE a.sha256 IS UNIQUE',
    ];

    for (const constraint of constraints) {
      try {
        await session.run(constraint);
        console.log(`[Neo4j] ✓ ${constraint.split(' ')[1]}`);
      } catch (error: any) {
        // Ignore if constraint already exists
        if (!error.message?.includes('already exists')) {
          console.warn(`[Neo4j] Warning creating constraint:`, error.message);
        }
      }
    }

    // Additional indexes for query performance
    const indexes = [
      'CREATE INDEX email_is_phishing IF NOT EXISTS FOR (e:Email) ON (e.is_phishing)',
      'CREATE INDEX email_sentDate IF NOT EXISTS FOR (e:Email) ON (e.sentDate)',
      'CREATE INDEX email_final_score IF NOT EXISTS FOR (e:Email) ON (e.final_score)',
    ];

    for (const index of indexes) {
      try {
        await session.run(index);
        console.log(`[Neo4j] ✓ ${index.split(' ')[1]}`);
      } catch (error: any) {
        if (!error.message?.includes('already exists')) {
          console.warn(`[Neo4j] Warning creating index:`, error.message);
        }
      }
    }

    console.log('[Neo4j] Schema constraints and indexes created successfully');

  } catch (error) {
    console.error('[Neo4j] Error creating schema constraints:', error);
    throw error;
  } finally {
    await session.close();
  }
}
