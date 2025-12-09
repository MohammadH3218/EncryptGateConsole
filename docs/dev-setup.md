# EncryptGate Development Setup Guide

## Prerequisites

- **Node.js**: v18+ (v20 recommended)
- **Python**: 3.11+ (for Flask auth server)
- **Neo4j**: 5.x (local or remote instance)
- **AWS CLI**: Configured with credentials
- **Git**: For version control

## Local Development Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd EncryptGateConsole
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies (for Flask server)
pip install -r requirements.txt
```

### 3. Environment Variables

Create a `.env.local` file in the project root:

```bash
# AWS Configuration
AWS_REGION=us-east-1
ACCESS_KEY_ID=your-access-key
SECRET_ACCESS_KEY=your-secret-key

# DynamoDB Tables (local or remote)
DETECTIONS_TABLE_NAME=Detections
INVESTIGATIONS_TABLE_NAME=Investigations
EMAILS_TABLE_NAME=Emails

# Neo4j Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
NEO4J_ENCRYPTED=false

# OpenAI Configuration
OPENAI_API_KEY=sk-your-api-key
OPENAI_MODEL=gpt-4o-mini

# Local Development Flag
LOCAL_DEV=true
```

**Note**: For production, use AWS Parameter Store instead of environment variables.

### 4. Neo4j Setup

#### Option A: Local Neo4j Desktop

1. Download and install [Neo4j Desktop](https://neo4j.com/download/)
2. Create a new database
3. Start the database
4. Note the connection URI (usually `bolt://localhost:7687`)
5. Set default password (or use existing)

#### Option B: Docker

```bash
docker run \
  --name neo4j-encryptgate \
  -p7474:7474 -p7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  -e NEO4J_PLUGINS='["apoc"]' \
  neo4j:5-community
```

Access Neo4j Browser at: http://localhost:7474

#### Option C: Remote Neo4j

If using a remote Neo4j instance (e.g., Neo4j Aura, EC2):

```bash
NEO4J_URI=bolt://your-neo4j-host:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
NEO4J_ENCRYPTED=true
```

### 5. Initialize Neo4j Schema

Run this Cypher query in Neo4j Browser or via cypher-shell:

```cypher
// Create indexes
CREATE INDEX user_email IF NOT EXISTS FOR (u:User) ON (u.email);
CREATE INDEX email_message_id IF NOT EXISTS FOR (e:Email) ON (e.messageId);
CREATE INDEX domain_name IF NOT EXISTS FOR (d:Domain) ON (d.name);

// Verify indexes
SHOW INDEXES;
```

### 6. AWS DynamoDB Setup

#### Option A: Local DynamoDB (for development)

```bash
# Install DynamoDB Local
docker run -p 8000:8000 amazon/dynamodb-local

# Create tables (use AWS CLI pointing to local endpoint)
aws dynamodb create-table \
  --endpoint-url http://localhost:8000 \
  --table-name Detections \
  --attribute-definitions AttributeName=detectionId,AttributeType=S \
  --key-schema AttributeName=detectionId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

Update `.env.local`:
```bash
AWS_ENDPOINT_URL=http://localhost:8000
```

#### Option B: Remote DynamoDB

Use existing AWS DynamoDB tables. Ensure IAM credentials have access.

### 7. Start Development Servers

#### Terminal 1: Next.js Dev Server

```bash
npm run dev
```

Server runs at: http://localhost:3000

#### Terminal 2: Flask Auth Server (optional)

```bash
python main.py
```

Server runs at: http://localhost:8000

**Note**: The Flask server is primarily for authentication. Most API routes are in Next.js.

### 8. Verify Setup

1. **Neo4j Connection**:
   ```bash
   curl http://localhost:3000/api/test-neo4j
   ```

2. **API Health**:
   ```bash
   curl http://localhost:3000/api/health
   ```

3. **Open Browser**:
   - Navigate to http://localhost:3000
   - You should see the landing page

## Development Workflow

### Running Tests

```bash
# Type checking
npm run type-check

# Linting
npm run lint

# Build (check for errors)
npm run build
```

### Code Structure

- **Frontend**: `app/`, `components/`, `lib/`
- **API Routes**: `app/api/`
- **Types**: `types/`
- **Hooks**: `hooks/`
- **Utils**: `lib/utils.ts`, `lib/aws.ts`, etc.

### Hot Reload

Next.js supports hot module replacement (HMR). Changes to:
- React components → Auto-reload
- API routes → Auto-reload (may need manual refresh)
- Server-side code → Restart dev server

### Debugging

#### VS Code Launch Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: debug server-side",
      "type": "node-terminal",
      "request": "launch",
      "command": "npm run dev"
    },
    {
      "name": "Next.js: debug client-side",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:3000"
    }
  ]
}
```

#### Browser DevTools

- React DevTools: Install browser extension
- Network tab: Monitor API calls
- Console: Check for errors

## Common Issues

### Neo4j Connection Failed

**Error**: `ECONNREFUSED` or `Connection timeout`

**Solutions**:
1. Verify Neo4j is running: `neo4j status` (Desktop) or check Docker
2. Check connection URI in `.env.local`
3. Verify firewall allows port 7687
4. Test connection: `cypher-shell -a bolt://localhost:7687 -u neo4j -p password`

### AWS Credentials Error

**Error**: `AWS credentials not configured`

**Solutions**:
1. Set `ACCESS_KEY_ID` and `SECRET_ACCESS_KEY` in `.env.local`
2. Or configure AWS CLI: `aws configure`
3. Or use IAM role (if on EC2/ECS)

### DynamoDB Table Not Found

**Error**: `ResourceNotFoundException`

**Solutions**:
1. Verify table names in `.env.local` match actual tables
2. Check AWS region matches table region
3. Verify IAM permissions for DynamoDB access

### OpenAI API Key Invalid

**Error**: `Invalid OpenAI API key`

**Solutions**:
1. Verify `OPENAI_API_KEY` in `.env.local` starts with `sk-`
2. Check API key is active in OpenAI dashboard
3. Ensure sufficient credits/quota

### Port Already in Use

**Error**: `Port 3000 is already in use`

**Solutions**:
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

## Database Seeding (Optional)

### Seed Sample Emails

Create a script `scripts/seed-emails.ts`:

```typescript
// Example: Add sample emails to Neo4j and DynamoDB
// Run with: npx tsx scripts/seed-emails.ts
```

### Seed Sample Detections

Use the API:

```bash
curl -X POST http://localhost:3000/api/emails/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "<test@example.com>",
    "from": "suspicious@example.com",
    "to": ["user@company.com"],
    "subject": "Test Detection",
    "body": "This is a test email with suspicious content",
    "timestamp": "2024-01-01T00:00:00Z"
  }'
```

## Production Deployment

See `docs/infra.md` for production infrastructure setup.

### Build for Production

```bash
npm run build
npm start
```

### Environment Variables (Production)

Use AWS Parameter Store or environment variables set in deployment platform (Vercel, AWS, etc.).

## Additional Resources

- **Next.js Docs**: https://nextjs.org/docs
- **Neo4j Docs**: https://neo4j.com/docs/
- **AWS SDK Docs**: https://docs.aws.amazon.com/sdk-for-javascript/
- **CopilotKit Docs**: https://docs.copilotkit.ai/

