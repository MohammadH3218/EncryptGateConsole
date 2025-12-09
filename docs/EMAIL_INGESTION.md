# Email Ingestion Pipeline Documentation

## Overview

The EncryptGate email ingestion pipeline processes incoming emails from AWS SES, analyzes them for threats, and stores them in DynamoDB and Neo4j for investigation.

## Architecture

```
AWS SES → Lambda Function → Threat Detection → DynamoDB + Neo4j
```

### Flow

1. **Email Reception**: SES receives email and triggers Lambda
2. **Email Processing**: Lambda extracts email data (headers, body, attachments)
3. **Threat Analysis**: Email is analyzed for phishing, malware, spam indicators
4. **Data Storage**: 
   - Raw email stored in S3
   - Email record written to DynamoDB
   - Detection record created if threat found
   - Graph nodes/relationships added to Neo4j
5. **Notification**: Analysts notified of new detections

## API Endpoints

### POST /api/emails/ingest

Entry point for email ingestion (called by Lambda or test scripts).

**Request Body**:
```json
{
  "messageId": "<message-id@domain.com>",
  "from": "sender@example.com",
  "to": ["recipient@company.com"],
  "cc": ["cc@company.com"],
  "subject": "Email Subject",
  "body": "Email body text",
  "htmlBody": "<html>...</html>",
  "headers": {
    "Received": "...",
    "Date": "...",
    "Message-ID": "..."
  },
  "attachments": [
    {
      "filename": "document.pdf",
      "contentType": "application/pdf",
      "size": 12345,
      "s3Key": "attachments/org-id/message-id/document.pdf"
    }
  ],
  "timestamp": "2024-01-01T00:00:00Z",
  "organizationId": "org-123"
}
```

**Response**:
```json
{
  "success": true,
  "emailId": "message-id@domain.com",
  "detectionCreated": true,
  "detectionId": "det-123",
  "threatScore": 75,
  "severity": "high"
}
```

### POST /api/threat-detection

Analyzes email content for threats using LLM-based analysis.

**Request Body**:
```json
{
  "messageId": "<message-id@domain.com>",
  "subject": "Email Subject",
  "from": "sender@example.com",
  "body": "Email body",
  "headers": {}
}
```

**Response**:
```json
{
  "success": true,
  "analysis": {
    "threatLevel": "high",
    "threatScore": 75,
    "isPhishing": true,
    "isMalware": false,
    "isSpam": false,
    "indicators": [
      "Suspicious URL detected",
      "Urgency language used",
      "Unknown sender domain"
    ],
    "reasoning": "Detailed analysis...",
    "confidence": 85
  }
}
```

## AWS Lambda Function

### EncryptGateEmailIngest

**Runtime**: Node.js 20.x or Python 3.11

**Handler**: `index.handler` (Node.js) or `lambda_function.lambda_handler` (Python)

**IAM Permissions**:
- `dynamodb:PutItem`, `dynamodb:UpdateItem` (Detections, Emails tables)
- `s3:PutObject` (raw email storage)
- `ssm:GetParameter` (Neo4j credentials, OpenAI key)
- `ses:SendEmail` (optional, for notifications)

**Event Source**: SES receipt rule

**Function Logic**:

```javascript
// Pseudo-code
async function handler(event) {
  // 1. Parse SES event
  const email = parseSESEvent(event)
  
  // 2. Extract email data
  const emailData = {
    messageId: email.messageId,
    from: email.from,
    to: email.to,
    subject: email.subject,
    body: email.body,
    headers: email.headers,
    attachments: email.attachments,
    timestamp: email.timestamp
  }
  
  // 3. Store raw email in S3
  await s3.putObject({
    Bucket: 'encryptgate-emails',
    Key: `emails/${orgId}/${year}/${month}/${email.messageId}.eml`,
    Body: email.raw
  })
  
  // 4. Run threat detection
  const threatAnalysis = await fetch('/api/threat-detection', {
    method: 'POST',
    body: JSON.stringify(emailData)
  })
  
  // 5. Store email in DynamoDB
  await dynamodb.putItem({
    TableName: 'Emails',
    Item: {
      messageId: email.messageId,
      ...emailData,
      threatScore: threatAnalysis.threatScore,
      createdAt: new Date().toISOString()
    }
  })
  
  // 6. Create detection if threat found
  if (threatAnalysis.threatLevel !== 'none' && threatAnalysis.threatScore > 30) {
    await dynamodb.putItem({
      TableName: 'Detections',
      Item: {
        detectionId: `det-${Date.now()}`,
        emailMessageId: email.messageId,
        severity: mapThreatLevel(threatAnalysis.threatLevel),
        status: 'new',
        indicators: threatAnalysis.indicators,
        threatScore: threatAnalysis.threatScore,
        createdAt: new Date().toISOString()
      }
    })
  }
  
  // 7. Update Neo4j graph
  await fetch('/api/graph/query', {
    method: 'POST',
    body: JSON.stringify({
      action: 'add_email',
      data: {
        messageId: email.messageId,
        sender: email.from,
        recipients: email.to,
        subject: email.subject,
        body: email.body,
        timestamp: email.timestamp,
        urls: extractURLs(email.body)
      }
    })
  })
  
  return { success: true }
}
```

## SES Configuration

### Receipt Rule Setup

1. **Verify Domain/Email**:
   ```bash
   aws ses verify-email-identity --email-address inbound@yourdomain.com
   ```

2. **Create Receipt Rule Set**:
   ```bash
   aws ses create-receipt-rule-set --rule-set-name encryptgate-inbound
   ```

3. **Create Receipt Rule**:
   ```bash
   aws ses create-receipt-rule \
     --rule-set-name encryptgate-inbound \
     --rule '{
       "Name": "EncryptGateLambdaRule",
       "Enabled": true,
       "Recipients": ["inbound@yourdomain.com"],
       "Actions": [{
         "LambdaAction": {
           "FunctionArn": "arn:aws:lambda:REGION:ACCOUNT_ID:function:EncryptGateEmailIngest",
           "InvocationType": "Event"
         }
       }],
       "TlsPolicy": "Optional"
     }'
   ```

4. **Activate Rule Set**:
   ```bash
   aws ses set-active-receipt-rule-set --rule-set-name encryptgate-inbound
   ```

## Threat Detection

### Detection Logic

The threat detection system uses:

1. **LLM-Based Analysis** (`/api/threat-detection`):
   - Analyzes email content for phishing indicators
   - Checks for urgency language, suspicious URLs
   - Evaluates sender reputation
   - Returns threat score (0-100) and severity level

2. **Rule-Based Checks**:
   - URL reputation (VirusTotal, URLScan.io)
   - Attachment scanning (ClamAV, file type analysis)
   - Domain reputation checks
   - SPF/DKIM/DMARC validation

3. **Risk Scoring**:
   - Combines multiple indicators
   - Weighted scoring algorithm
   - Confidence levels

### Severity Mapping

- **Critical** (80-100): Confirmed malware, active phishing campaign
- **High** (60-79): Strong phishing indicators, suspicious attachments
- **Medium** (40-59): Moderate risk, unusual patterns
- **Low** (20-39): Minor concerns, requires review
- **None** (0-19): Clean email

## Neo4j Graph Updates

When an email is ingested, the following graph structure is created:

```cypher
// Create User nodes
MERGE (sender:User {email: $sender})
MERGE (recipient:User {email: $recipient})

// Create Email node
MERGE (email:Email {messageId: $messageId})
SET email.subject = $subject,
    email.body = $body,
    email.sentDate = $timestamp,
    email.severity = $severity

// Create relationships
MERGE (sender)-[:WAS_SENT]->(email)
MERGE (email)-[:WAS_SENT_TO]->(recipient)

// Create URL nodes and relationships
FOREACH (url IN $urls |
  MERGE (urlNode:URL {url: url})
  MERGE (email)-[:CONTAINS_URL]->(urlNode)
)
```

## Testing

### Manual Email Ingestion

```bash
curl -X POST http://localhost:3000/api/emails/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "<test@example.com>",
    "from": "suspicious@example.com",
    "to": ["user@company.com"],
    "subject": "Urgent: Verify Your Account",
    "body": "Click here to verify: https://suspicious-site.com/verify",
    "timestamp": "2024-01-01T00:00:00Z",
    "organizationId": "org-123"
  }'
```

### Test Threat Detection

```bash
curl -X POST http://localhost:3000/api/threat-detection \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "<test@example.com>",
    "subject": "Urgent: Verify Your Account",
    "from": "suspicious@example.com",
    "body": "Click here to verify: https://suspicious-site.com/verify"
  }'
```

## Error Handling

### Common Issues

1. **SES Event Parsing Failure**:
   - Log error and return 400
   - Email stored in dead-letter queue

2. **DynamoDB Write Failure**:
   - Retry with exponential backoff
   - Store in S3 for manual processing

3. **Neo4j Connection Failure**:
   - Log error but continue
   - Queue graph update for later

4. **Threat Detection Timeout**:
   - Use default risk score
   - Mark for manual review

## Monitoring

### CloudWatch Metrics

- `EmailsIngested` - Count of emails processed
- `DetectionsCreated` - Count of detections created
- `ThreatScoreAverage` - Average threat score
- `ProcessingTime` - Time to process email
- `Errors` - Error count by type

### CloudWatch Logs

- Lambda execution logs
- Error traces
- Performance metrics

## Security Considerations

1. **Email Content**: Raw emails stored encrypted in S3
2. **PII Handling**: Sensitive data redacted in logs
3. **Access Control**: IAM roles restrict access
4. **Rate Limiting**: Prevent abuse of ingestion endpoint
5. **Validation**: Strict input validation on all fields

## Future Enhancements

1. **Real-time Processing**: Stream processing with Kinesis
2. **Advanced ML Models**: Custom phishing detection models
3. **Sandboxing**: Deep attachment analysis
4. **Reputation Services**: Integration with threat intelligence feeds
5. **Auto-remediation**: Automatic actions for high-confidence threats

