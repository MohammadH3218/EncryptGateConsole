// lib/investigation-pipelines.ts - Pre-defined investigation workflows

/**
 * Pipeline definitions for common investigation tasks
 */

export interface InvestigationPipeline {
  name: string
  description: string
  prompt: string
  expectedSteps: string[]
}

/**
 * Initialize Investigation - Comprehensive multi-step analysis
 *
 * This runs a structured investigation workflow:
 * 1. Get basic email context
 * 2. Analyze sender behavior
 * 3. Check recipient patterns
 * 4. Look for similar past incidents
 * 5. Calculate risk metrics
 */
export const INITIALIZE_PIPELINE: InvestigationPipeline = {
  name: 'Initialize Investigation',
  description: 'Run a comprehensive multi-step investigation to build a complete picture of this email',
  prompt: `Conduct a thorough email security investigation using the following systematic approach:

**Step 1: Basic Email Context**
- Get the email's subject, sender, recipients, date, and key metadata
- Check if the email has attachments or URLs
- Query: MATCH (s:User)-[:WAS_SENT]->(e:Email {messageId: $emailId})
        OPTIONAL MATCH (e)-[:WAS_SENT_TO]->(r:User)
        OPTIONAL MATCH (e)-[:CONTAINS_URL]->(u:URL)
        RETURN e, s, collect(DISTINCT r.email) AS recipients, collect(DISTINCT u.url) AS urls

**Step 2: Sender Behavior Analysis (last 90 days)**
- How many emails has this sender sent recently?
- What's their typical recipient count (fanout)?
- Is this email's behavior unusual compared to their baseline?
- Query: MATCH (s:User {email: $senderEmail})-[:WAS_SENT]->(e:Email)
        WHERE e.sentDate >= date() - duration('P90D')
        RETURN count(e) AS totalSent,
               avg(size((e)-[:WAS_SENT_TO]->())) AS avgRecipients,
               max(size((e)-[:WAS_SENT_TO]->())) AS maxRecipients

**Step 3: Recipient Spread Analysis**
- Who else received this email or similar emails?
- Is this a targeted attack or mass campaign?
- Query: MATCH (e:Email {messageId: $emailId})-[:WAS_SENT_TO]->(r:User)
        WITH e, collect(r.email) AS directRecipients
        MATCH (e2:Email)
        WHERE e2.subject = e.subject
          AND e2.messageId <> e.messageId
          AND abs(duration.inSeconds(e2.sentDate, e.sentDate).seconds) < 86400
        MATCH (e2)-[:WAS_SENT_TO]->(r2:User)
        RETURN e2.messageId, e2.sentDate, collect(r2.email) AS recipients

**Step 4: Historical Risk Assessment**
- Check for prior incidents linked to this sender or domain
- Look for similar suspicious patterns in the past
- Query: MATCH (e:Email {messageId: $emailId})
        MATCH (sender:User)-[:WAS_SENT]->(e)
        OPTIONAL MATCH (sender)-[:WAS_SENT]->(pastEmail:Email)
        WHERE pastEmail.flagged = true OR pastEmail.malicious = true
        RETURN count(DISTINCT pastEmail) AS priorSuspiciousEmails,
               collect(DISTINCT pastEmail.subject)[0..5] AS examples

**Step 5: Generate Summary & Risk Score**
Based on all the evidence gathered:
- Summarize the key findings
- Explain why this email was flagged
- Calculate a risk score (Low/Medium/High/Critical)
- Identify the most suspicious elements
- Recommend specific next steps

**Evidence Requirements:**
- Every claim must cite a specific query result
- Use actual numbers and data from the tool outputs
- If data is missing or queries fail, acknowledge it
- Provide confidence levels for your assessments

**Output Format:**
## Investigation Summary
[2-3 sentence overview]

## Why This Email Was Flagged
[Specific reasons with evidence citations]

## Sender Risk Profile
[Behavior analysis from Step 2]

## Distribution Pattern
[Recipient analysis from Step 3]

## Historical Context
[Prior incidents from Step 4]

## Risk Assessment
**Risk Level:** [Low/Medium/High/Critical]
**Confidence:** [Low/Medium/High]
**Key Indicators:**
- [Indicator 1 with evidence]
- [Indicator 2 with evidence]

## Recommended Actions
1. [Action based on findings]
2. [Action based on findings]
3. [Action based on findings]

Begin the investigation now.`,
  expectedSteps: [
    'Inspect schema or get email context',
    'Analyze sender behavior',
    'Check recipient patterns',
    'Review historical incidents',
    'Generate risk assessment'
  ]
}

/**
 * Why Flagged - Quick explanation of detection reasons
 */
export const WHY_FLAGGED_PIPELINE: InvestigationPipeline = {
  name: 'Why Was This Flagged?',
  description: 'Quickly explain why this email triggered a security alert',
  prompt: `Explain why this email was flagged as suspicious.

**Investigation Steps:**
1. Get the email's flagging metadata (if available)
2. Analyze the sender's reputation
3. Check for known malicious indicators (suspicious URLs, domains, patterns)
4. Compare to typical phishing/malware patterns

**Query the following:**
- Email properties: subject, sender, URLs, attachments
- Sender's historical behavior
- URL reputation (if URLs present)
- Pattern matching against known threats

**Output:**
Provide a clear, concise explanation (3-5 bullet points) of:
- The primary reason for flagging
- Supporting evidence from the database
- Any secondary concerns
- Confidence level in the detection

Focus on being quick and actionable - this should complete in 2-3 queries.`,
  expectedSteps: [
    'Get email flagging metadata',
    'Check sender reputation',
    'Analyze suspicious indicators',
    'Summarize findings'
  ]
}

/**
 * Who Else Got This - Analyze recipient patterns
 */
export const WHO_ELSE_PIPELINE: InvestigationPipeline = {
  name: 'Who Else Received This?',
  description: 'Analyze who else received this email or similar emails',
  prompt: `Investigate who else received this email or similar campaigns.

**Analysis Steps:**
1. Find all direct recipients of this specific email
2. Find similar emails (same subject, similar timeframe)
3. Identify if this is a targeted attack or mass campaign
4. Look for patterns in recipient selection

**Queries to run:**
- Direct recipients: MATCH (e:Email {messageId: $emailId})-[:WAS_SENT_TO]->(r:User)
                     RETURN collect(r.email) AS recipients

- Similar emails: MATCH (e:Email {messageId: $emailId})
                  MATCH (e2:Email)
                  WHERE e2.subject = e.subject
                    AND e2.messageId <> e.messageId
                  MATCH (e2)-[:WAS_SENT_TO]->(r:User)
                  RETURN e2.messageId, e2.sentDate, collect(r.email) AS recipients

- Recipient overlap: Find users who received multiple similar emails

**Output:**
## Direct Recipients
[List of recipients for this email]

## Similar Campaign Emails
[Table of similar emails and their recipients]

## Pattern Analysis
- Total unique recipients: [number]
- Campaign type: [Targeted/Mass/Mixed]
- Recipient commonalities: [department, domain, etc.]
- Suspicious patterns: [any unusual targeting]

## Risk Implications
[What the recipient pattern tells us about the threat]`,
  expectedSteps: [
    'Get direct recipients',
    'Find similar emails',
    'Analyze patterns',
    'Assess targeting strategy'
  ]
}

/**
 * Sender Risk - Comprehensive sender analysis
 */
export const SENDER_RISK_PIPELINE: InvestigationPipeline = {
  name: 'Sender Risk Assessment',
  description: 'Analyze the sender\'s behavior, reputation, and risk profile',
  prompt: `Conduct a comprehensive risk assessment of the email sender.

**Investigation Areas:**
1. Sender identity and email address analysis
2. Historical sending behavior (volume, patterns, recipients)
3. Prior security incidents or flagged emails
4. Sender reputation and domain analysis
5. Behavioral anomalies

**Queries:**

1. Basic sender info:
   MATCH (s:User)-[:WAS_SENT]->(e:Email {messageId: $emailId})
   RETURN s.email AS sender, s.domain AS domain

2. Sending history (90 days):
   MATCH (s:User {email: $senderEmail})-[:WAS_SENT]->(e:Email)
   WHERE e.sentDate >= date() - duration('P90D')
   RETURN count(e) AS emailsSent,
          min(e.sentDate) AS firstSeen,
          max(e.sentDate) AS lastSeen,
          avg(size((e)-[:WAS_SENT_TO]->())) AS avgRecipients

3. Flagged/malicious emails:
   MATCH (s:User {email: $senderEmail})-[:WAS_SENT]->(e:Email)
   WHERE e.flagged = true OR e.malicious = true
   RETURN count(e) AS suspiciousCount,
          collect(e.subject)[0..5] AS examples

4. Recipient diversity:
   MATCH (s:User {email: $senderEmail})-[:WAS_SENT]->(e:Email)-[:WAS_SENT_TO]->(r:User)
   RETURN count(DISTINCT r.email) AS uniqueRecipients,
          count(DISTINCT r.domain) AS uniqueDomains

**Output:**

## Sender Profile
- Email: [sender email]
- Domain: [sender domain]
- First seen: [date]
- Activity level: [High/Medium/Low]

## Behavioral Metrics
- Total emails (90d): [number]
- Average recipients: [number]
- Unique recipients: [number]
- Sending frequency: [pattern]

## Risk Indicators
- Prior flagged emails: [number]
- Prior malicious emails: [number]
- Behavioral anomalies: [list]
- Domain reputation: [assessment]

## Risk Score
**Level:** [Low/Medium/High/Critical]
**Justification:** [evidence-based reasoning]

## Recommendations
[Specific actions based on risk level]`,
  expectedSteps: [
    'Get sender identity',
    'Analyze sending history',
    'Check for prior incidents',
    'Assess behavioral patterns',
    'Calculate risk score'
  ]
}

/**
 * Similar Incidents - Find related past cases
 */
export const SIMILAR_INCIDENTS_PIPELINE: InvestigationPipeline = {
  name: 'Find Similar Past Incidents',
  description: 'Search for similar emails, patterns, or campaigns in historical data',
  prompt: `Find similar past incidents, emails, or security events related to this investigation.

**Search Criteria:**
1. Emails with similar subjects
2. Emails from the same sender or domain
3. Emails with similar URL patterns
4. Emails flagged for similar reasons
5. Related investigation cases

**Queries:**

1. Similar subjects:
   MATCH (e:Email {messageId: $emailId})
   MATCH (e2:Email)
   WHERE e2.subject CONTAINS e.subject OR e.subject CONTAINS e2.subject
     AND e2.messageId <> e.messageId
   ORDER BY e2.sentDate DESC
   LIMIT 10
   RETURN e2.messageId, e2.subject, e2.sentDate, e2.flagged

2. Same sender history:
   MATCH (s:User)-[:WAS_SENT]->(e:Email {messageId: $emailId})
   MATCH (s)-[:WAS_SENT]->(e2:Email)
   WHERE e2.messageId <> e.messageId
   ORDER BY e2.sentDate DESC
   LIMIT 10
   RETURN e2.messageId, e2.subject, e2.sentDate, e2.flagged

3. Similar URL patterns:
   MATCH (e:Email {messageId: $emailId})-[:CONTAINS_URL]->(u:URL)
   MATCH (e2:Email)-[:CONTAINS_URL]->(u2:URL)
   WHERE u2.domain = u.domain AND e2.messageId <> e.messageId
   RETURN e2.messageId, e2.subject, collect(u2.url) AS urls, e2.flagged
   LIMIT 10

**Output:**

## Similar Email Campaigns
[Table of similar emails with dates, subjects, flagged status]

## Common Patterns Identified
- Subject patterns: [patterns found]
- URL patterns: [domains/patterns]
- Timing patterns: [temporal clusters]
- Targeting patterns: [recipient similarities]

## Past Incident Summary
- Total similar incidents found: [number]
- Previously flagged: [number]
- Previously confirmed malicious: [number]
- Campaign duration: [timespan]

## Learning from History
[What these similar incidents tell us about this current email]

## Recommended Actions
[Based on how similar incidents were handled]`,
  expectedSteps: [
    'Search similar subjects',
    'Check sender history',
    'Find URL pattern matches',
    'Analyze patterns',
    'Provide historical context'
  ]
}

/**
 * All available pipelines
 */
export const INVESTIGATION_PIPELINES = {
  initialize: INITIALIZE_PIPELINE,
  whyFlagged: WHY_FLAGGED_PIPELINE,
  whoElse: WHO_ELSE_PIPELINE,
  senderRisk: SENDER_RISK_PIPELINE,
  similarIncidents: SIMILAR_INCIDENTS_PIPELINE
} as const

export type PipelineType = keyof typeof INVESTIGATION_PIPELINES
