# EncryptGate Neo4j Ontology

## Overview
This document defines the canonical schema for EncryptGate's graph database. All components must adhere to this ontology for consistency.

## Core Entities (Nodes)

### Email
**Purpose:** Represents an email message

**Properties:**
- `messageId` (String, unique) - RFC 5322 Message-ID
- `subject` (String) - Email subject line
- `body` (String) - Email body content
- `timestamp` (DateTime) - When email was sent
- `receivedAt` (DateTime) - When email was received by system
- `threatScore` (Float, 0-100) - DistilBERT ML model score
- `threatLevel` (String) - Enum: ["none", "low", "medium", "high", "critical"]
- `status` (String) - Enum: ["clean", "flagged", "blocked", "quarantined"]
- `flaggedStatus` (String) - Enum: ["clean", "AI", "manual"]
- `flaggedCategory` (String) - Type of threat if flagged
- `allowed` (Boolean) - Whether email was allowed by analyst
- `blocked` (Boolean) - Whether email was blocked
- `distilbert_score` (Float) - Raw DistilBERT output
- `vt_score` (Float) - VirusTotal aggregate score
- `context_score` (Float) - Contextual analysis score

### User
**Purpose:** Represents a sender or recipient

**Properties:**
- `email` (String, unique) - Email address
- `name` (String) - Display name
- `organization` (String) - Organization/domain
- `firstSeen` (DateTime) - First time seen in system
- `lastSeen` (DateTime) - Last activity
- `emailCount` (Integer) - Total emails sent/received
- `reputation` (Float) - Reputation score based on behavior
- `isInternal` (Boolean) - Whether user is internal to org

### Domain
**Purpose:** Represents an email domain or web domain

**Properties:**
- `name` (String, unique) - Domain name (e.g., "example.com")
- `reputation` (Float) - Aggregate reputation score
- `firstSeen` (DateTime) - First appearance in system
- `lastSeen` (DateTime) - Last activity
- `vtScore` (Float) - VirusTotal domain score
- `emailCount` (Integer) - Emails from/to this domain
- `urlCount` (Integer) - URLs linking to this domain
- `isMalicious` (Boolean) - Known malicious flag
- `category` (String) - Domain category (spam, phishing, etc.)

### URL
**Purpose:** Represents a URL found in email content

**Properties:**
- `url` (String, unique) - Full URL
- `domain` (String) - Extracted domain
- `path` (String) - URL path
- `vtScore` (Float) - VirusTotal URL score
- `isMalicious` (Boolean) - Known malicious flag
- `firstSeen` (DateTime)
- `lastSeen` (DateTime)
- `clickCount` (Integer) - Number of times clicked (if tracked)

### Attachment
**Purpose:** Represents email attachments

**Properties:**
- `filename` (String) - Original filename
- `hash` (String, unique) - SHA256 file hash
- `fileType` (String) - MIME type
- `size` (Integer) - File size in bytes
- `vtScore` (Float) - VirusTotal file hash score
- `isMalicious` (Boolean) - Known malicious flag
- `firstSeen` (DateTime)
- `scanDate` (DateTime) - When scanned by VT

### Detection
**Purpose:** Represents a security detection/alert

**Properties:**
- `id` (String, unique) - Detection ID
- `type` (String) - Detection type (phishing, malware, BEC, etc.)
- `severity` (String) - Enum: ["low", "medium", "high", "critical"]
- `confidence` (Float, 0-1) - Detection confidence
- `timestamp` (DateTime) - When detected
- `source` (String) - Detection source (DistilBERT, VT, manual)
- `description` (String) - Human-readable description
- `falsePositive` (Boolean) - Marked as false positive

### Campaign
**Purpose:** Represents a coordinated attack campaign

**Properties:**
- `id` (String, unique) - Campaign ID
- `name` (String) - Campaign name/identifier
- `startDate` (DateTime) - Campaign start
- `endDate` (DateTime) - Campaign end (if known)
- `emailCount` (Integer) - Emails in campaign
- `severity` (String) - Campaign severity
- `description` (String) - Campaign description
- `active` (Boolean) - Whether campaign is ongoing
- `iocs` (List<String>) - Indicators of compromise

### Investigation
**Purpose:** Represents an analyst investigation

**Properties:**
- `id` (String, unique) - Investigation ID
- `status` (String) - Enum: ["new", "in_progress", "completed", "escalated"]
- `assignedTo` (String) - Analyst email
- `startedAt` (DateTime)
- `completedAt` (DateTime)
- `priority` (String) - Enum: ["low", "medium", "high"]
- `notes` (String) - Investigation notes
- `decision` (String) - Final decision (allow, block, quarantine)

## Relationships

### Email Relationships

#### WAS_SENT
- **From:** User → Email
- **Meaning:** User sent this email
- **Properties:**
  - `timestamp` (DateTime) - When sent

#### WAS_SENT_TO
- **From:** Email → User
- **Meaning:** Email was sent to this user
- **Properties:**
  - `deliveryStatus` (String) - Delivered, bounced, etc.

#### CONTAINS_URL
- **From:** Email → URL
- **Meaning:** Email contains this URL
- **Properties:**
  - `position` (Integer) - Position in email body
  - `clicked` (Boolean) - Whether URL was clicked

#### HAS_ATTACHMENT
- **From:** Email → Attachment
- **Meaning:** Email has this attachment
- **Properties:**
  - `attachmentIndex` (Integer) - Order in attachments list

#### TRIGGERED_DETECTION
- **From:** Email → Detection
- **Meaning:** Email triggered this detection
- **Properties:**
  - `timestamp` (DateTime) - When triggered

#### PART_OF_CAMPAIGN
- **From:** Email → Campaign
- **Meaning:** Email is part of this campaign
- **Properties:**
  - `confidence` (Float) - Campaign membership confidence

### Domain Relationships

#### BELONGS_TO_DOMAIN
- **From:** URL → Domain
- **Meaning:** URL belongs to this domain
- **Properties:** None

#### SENDER_DOMAIN
- **From:** User → Domain
- **Meaning:** User's email is from this domain
- **Properties:** None

### Investigation Relationships

#### INVESTIGATES
- **From:** Investigation → Email
- **Meaning:** Investigation is about this email
- **Properties:**
  - `startedAt` (DateTime)

#### SIMILAR_TO
- **From:** Email → Email
- **Meaning:** Emails are similar (same campaign, sender, patterns)
- **Properties:**
  - `similarity` (Float, 0-1) - Similarity score
  - `reason` (String) - Why they're similar

## Query Patterns

### Common Queries

```cypher
// Find all emails from a sender
MATCH (u:User {email: $senderEmail})-[:WAS_SENT]->(e:Email)
RETURN e

// Find campaign emails
MATCH (c:Campaign {id: $campaignId})<-[:PART_OF_CAMPAIGN]-(e:Email)
RETURN e

// Find emails with malicious URLs
MATCH (e:Email)-[:CONTAINS_URL]->(url:URL {isMalicious: true})
RETURN e, url

// Sender history
MATCH (u:User)-[:WAS_SENT]->(e:Email)
WHERE u.email = $senderEmail
RETURN e
ORDER BY e.timestamp DESC
LIMIT 20

// Find related emails (same domain)
MATCH (e1:Email {messageId: $messageId})-[:CONTAINS_URL]->(url1:URL)-[:BELONGS_TO_DOMAIN]->(d:Domain)
MATCH (d)<-[:BELONGS_TO_DOMAIN]-(url2:URL)<-[:CONTAINS_URL]-(e2:Email)
WHERE e1 <> e2
RETURN e2, count(*) as urlCount
ORDER BY urlCount DESC
```

## Indexing Strategy

### Required Indexes

```cypher
// Primary lookups
CREATE INDEX email_messageId FOR (e:Email) ON (e.messageId);
CREATE INDEX user_email FOR (u:User) ON (u.email);
CREATE INDEX domain_name FOR (d:Domain) ON (d.name);
CREATE INDEX url_url FOR (url:URL) ON (url.url);
CREATE INDEX attachment_hash FOR (a:Attachment) ON (a.hash);
CREATE INDEX campaign_id FOR (c:Campaign) ON (c.id);
CREATE INDEX detection_id FOR (det:Detection) ON (det.id);

// Common filters
CREATE INDEX email_status FOR (e:Email) ON (e.status);
CREATE INDEX email_threatLevel FOR (e:Email) ON (e.threatLevel);
CREATE INDEX email_timestamp FOR (e:Email) ON (e.timestamp);
```

## Migration Guidelines

When adding new properties or relationships:

1. Update this ontology document first
2. Add migration script in `migrations/` folder
3. Update all ingestion pipelines to populate new fields
4. Add indexes for commonly queried fields
5. Update UI components to display new data

## Version History

- v1.0 (2025-01-13) - Initial ontology definition
- v1.1 (TBD) - Add Investigation entity and relationships
