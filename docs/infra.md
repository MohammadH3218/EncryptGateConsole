# EncryptGate Infrastructure Documentation

## AWS Resources

### DynamoDB Tables

#### Detections Table
- **Table Name**: `Detections` (or configured via `DETECTIONS_TABLE_NAME` env var)
- **Primary Key**: `detectionId` (String)
- **Attributes**:
  - `organizationId` (String)
  - `emailMessageId` (String)
  - `severity` (String: low, medium, high, critical)
  - `status` (String: new, in_progress, resolved, false_positive)
  - `name`, `description`, `sentBy`, `assignedTo` (JSON array)
  - `indicators`, `recommendations` (JSON arrays)
  - `threatScore`, `confidence` (Number)
  - `createdAt`, `timestamp` (String, ISO 8601)

#### Investigations Table
- **Table Name**: `Investigations` (or configured via `INVESTIGATIONS_TABLE_NAME` env var)
- **Primary Key**: `investigationId` (String)
- **Attributes**:
  - `emailMessageId` (String)
  - `organizationId` (String)
  - `status` (String: active, completed, escalated)
  - `priority` (String: low, medium, high, critical)
  - `investigatorId`, `investigatorName` (String)
  - `createdAt`, `updatedAt` (String)

#### Emails Table
- **Table Name**: `Emails` (or configured via `EMAILS_TABLE_NAME` env var)
- **Primary Key**: `messageId` (String)
- **Attributes**:
  - `organizationId` (String)
  - `subject`, `from`, `to` (String/Array)
  - `bodyPlain`, `bodyHtml` (String)
  - `headers` (JSON object)
  - `rawS3Key` (String, S3 key for raw email)
  - `createdAt` (String)

### S3 Buckets

#### Raw Email Storage
- **Bucket Name**: Configured via `S3_BUCKET_NAME` env var
- **Purpose**: Store raw email messages and attachments
- **Structure**:
  - `emails/{orgId}/{year}/{month}/{messageId}.eml`
  - `attachments/{orgId}/{messageId}/{filename}`

### AWS SES (Simple Email Service)

#### Inbound Email Configuration

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

### AWS Lambda

#### EncryptGateEmailIngest Function

- **Runtime**: Node.js 20.x or Python 3.11
- **Handler**: `index.handler` (Node.js) or `lambda_function.lambda_handler` (Python)
- **Trigger**: SES receipt rule
- **IAM Permissions**:
  - `dynamodb:PutItem`, `dynamodb:UpdateItem` (Detections, Emails tables)
  - `s3:PutObject` (raw email storage)
  - `ses:SendEmail` (optional, for notifications)
  - `ssm:GetParameter` (Neo4j credentials, OpenAI key)

**Function Logic**:
1. Receive SES event
2. Fetch raw email from S3 (if stored there) or parse inline
3. Extract: headers, subject, from, to, body, attachments
4. Run threat detection (call `/api/threat-detection` or inline logic)
5. Write to DynamoDB (email + detection records)
6. Update Neo4j graph (via API or direct connection)
7. Optionally invoke downstream Lambdas for deep analysis

### AWS Parameter Store (SSM)

#### Parameters

- `encryptgate-neo4j-uri` - Neo4j connection URI (e.g., `bolt://localhost:7687`)
- `encryptgate-neo4j-user` - Neo4j username
- `encryptgate-neo4j-password` - Neo4j password (SecureString, encrypted)
- `encryptgate-openai-api-key` - OpenAI API key (SecureString, encrypted)

**Create Parameters**:
```bash
# Neo4j URI
aws ssm put-parameter \
  --name encryptgate-neo4j-uri \
  --value "bolt://your-neo4j-host:7687" \
  --type String

# Neo4j User
aws ssm put-parameter \
  --name encryptgate-neo4j-user \
  --value "neo4j" \
  --type String

# Neo4j Password (encrypted)
aws ssm put-parameter \
  --name encryptgate-neo4j-password \
  --value "your-password" \
  --type SecureString

# OpenAI API Key (encrypted)
aws ssm put-parameter \
  --name encryptgate-openai-api-key \
  --value "sk-..." \
  --type SecureString
```

### AWS Cognito

#### User Pool Configuration
- User authentication and authorization
- JWT tokens for API access
- Role-based access control (RBAC)

## Neo4j Database

### Connection
- **URI**: Configured via Parameter Store or `NEO4J_URI` env var
- **Authentication**: Username/password from Parameter Store or env vars
- **Encryption**: Optional (configured via `NEO4J_ENCRYPTED` env var)

### Graph Schema

#### Nodes
- **User**: `{email, name?, orgId}`
- **Domain**: `{name, orgId}`
- **Email**: `{id, messageId, subject, sentAt, severity, riskScore, orgId}`
- **Attachment**: `{id, filename, mimeType, verdict}`
- **URL**: `{id, value, risk}`
- **Incident**: `{id, type, createdAt, severity}`

#### Relationships
- `(User)-[:WAS_SENT]->(Email)` - User sent email
- `(Email)-[:WAS_SENT_TO]->(User)` - Email sent to user
- `(Email)-[:FROM_DOMAIN]->(Domain)` - Email from domain
- `(Email)-[:HAS_ATTACHMENT]->(Attachment)` - Email has attachment
- `(Email)-[:CONTAINS_URL]->(URL)` - Email contains URL
- `(Email)-[:PART_OF_CAMPAIGN]->(Incident)` - Email part of campaign

### Indexes
```cypher
CREATE INDEX user_email IF NOT EXISTS FOR (u:User) ON (u.email);
CREATE INDEX email_message_id IF NOT EXISTS FOR (e:Email) ON (e.messageId);
CREATE INDEX domain_name IF NOT EXISTS FOR (d:Domain) ON (d.name);
```

## Deployment

### Environment Variables

#### Next.js Application
```bash
# AWS
AWS_REGION=us-east-1
ACCESS_KEY_ID=your-access-key
SECRET_ACCESS_KEY=your-secret-key

# DynamoDB
DETECTIONS_TABLE_NAME=Detections
INVESTIGATIONS_TABLE_NAME=Investigations
EMAILS_TABLE_NAME=Emails

# S3
S3_BUCKET_NAME=encryptgate-emails

# Neo4j (optional, if not using Parameter Store)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
NEO4J_ENCRYPTED=false

# OpenAI (optional, if not using Parameter Store)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

### IAM Roles

#### Application Role (EC2/ECS/Lambda)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/Detections",
        "arn:aws:dynamodb:*:*:table/Investigations",
        "arn:aws:dynamodb:*:*:table/Emails"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::encryptgate-emails/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": [
        "arn:aws:ssm:*:*:parameter/encryptgate-neo4j-*",
        "arn:aws:ssm:*:*:parameter/encryptgate-openai-api-key"
      ]
    }
  ]
}
```

## Monitoring & Logging

### CloudWatch Logs
- Application logs: `/aws/lambda/EncryptGateEmailIngest`
- Next.js logs: Application-specific log group

### Metrics
- Email ingestion rate
- Detection creation rate
- API response times
- Neo4j query performance

## Security

### Encryption
- S3: Server-side encryption (SSE-S3 or SSE-KMS)
- DynamoDB: Encryption at rest (AWS managed keys)
- Parameter Store: SecureString parameters encrypted with KMS
- Neo4j: TLS/SSL for encrypted connections (optional)

### Network Security
- Neo4j: Firewall rules to restrict access (security groups)
- API: HTTPS only (via CloudFront/ALB)
- VPC: Deploy Lambda in VPC for Neo4j access if needed

## Cost Optimization

### DynamoDB
- Use on-demand billing for variable workloads
- Consider reserved capacity for steady-state workloads
- Enable point-in-time recovery only if needed

### S3
- Lifecycle policies: Move old emails to Glacier after 90 days
- Intelligent-Tiering for automatic cost optimization

### Lambda
- Optimize function memory and timeout
- Use provisioned concurrency only if needed

### Neo4j
- Self-hosted on EC2: Use appropriate instance types
- Neo4j Aura: Consider managed service for production

