# EncryptGate Architecture Documentation

## Overview

EncryptGate is an AI-powered email security and SOC platform built with Next.js, TypeScript, Neo4j, and AWS services. This document outlines the current architecture, routes, and backend modules.

## Technology Stack

- **Frontend**: Next.js 15 (App Router), React 18, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Next.js API Routes, Flask (Python) for auth services
- **Database**: DynamoDB (primary), Neo4j (graph database)
- **AI/ML**: OpenAI GPT-4, CopilotKit for chat interface
- **Cloud**: AWS (SES, Lambda, S3, Parameter Store, Cognito)
- **UI Components**: Radix UI, shadcn/ui

## Project Structure

```
EncryptGateConsole/
├── app/                          # Next.js App Router
│   ├── api/                      # API route handlers
│   │   ├── detections/           # Detection management
│   │   ├── investigations/       # Investigation management
│   │   ├── email/                # Email operations
│   │   ├── graph/                # Neo4j graph queries
│   │   ├── copilotkit/           # CopilotKit runtime
│   │   ├── threat-detection/     # Threat analysis
│   │   └── ...
│   ├── o/[orgId]/admin/          # Organization-scoped admin pages
│   │   ├── dashboard/            # Main dashboard
│   │   ├── detections/           # Detections list
│   │   ├── all-emails/           # All emails view
│   │   ├── investigate/          # Investigation pages
│   │   └── ...
│   └── investigate/[id]/         # Investigation detail pages
├── components/                   # React components
│   ├── ui/                       # shadcn/ui components
│   ├── command-center/           # Right rail command center
│   ├── InvestigationCopilotPanel.tsx
│   └── ...
├── lib/                          # Core libraries
│   ├── neo4j.ts                  # Neo4j connection & queries
│   ├── agent.ts                  # Multi-step investigation agent
│   ├── agent-stream.ts           # Streaming agent responses
│   ├── copilot.ts                # Security Copilot service
│   ├── aws.ts                    # AWS SDK utilities
│   ├── email-helpers.ts          # Email processing
│   └── ...
├── types/                        # TypeScript type definitions
├── hooks/                        # React hooks
├── contexts/                     # React contexts
└── docs/                         # Documentation

```

## API Routes

### Detections
- `GET /api/detections` - List detections (with pagination, filters)
- `GET /api/detections/[id]` - Get detection details
- `PATCH /api/detections/[id]` - Update detection (status, assignment)
- `DELETE /api/detections/[id]` - Delete/unflag detection

### Investigations
- `GET /api/investigations` - List investigations
- `GET /api/investigations/[id]` - Get investigation details
- `POST /api/investigations` - Create new investigation
- `PATCH /api/investigations/[id]` - Update investigation

### Emails
- `GET /api/email` - List emails
- `GET /api/email/[id]` - Get email details
- `POST /api/emails/ingest` - Ingest new email (from SES/Lambda)

### Graph (Neo4j)
- `POST /api/graph/query` - Execute graph queries
- `GET /api/graph/health` - Health check

### CopilotKit
- `POST /api/copilotkit` - CopilotKit runtime endpoint (streaming chat)

### Stats
- `GET /api/stats/queue` - Queue statistics (Total, New, In Progress, Resolved)
- `GET /api/stats/detections-summary` - Detection summary statistics

### Threat Detection
- `POST /api/threat-detection` - Analyze email threat level

## Data Models

### Detection
```typescript
{
  id: string
  detectionId: string
  emailMessageId: string
  organizationId: string
  severity: "low" | "medium" | "high" | "critical"
  status: "new" | "in_progress" | "resolved" | "false_positive"
  name: string
  description: string
  sentBy: string
  assignedTo: string[]
  indicators: string[]
  recommendations: string[]
  threatScore: number
  confidence: number
  manualFlag: boolean
  createdAt: string
  timestamp: string
}
```

### Investigation
```typescript
{
  id: string
  investigationId: string
  emailMessageId: string
  organizationId: string
  status: "active" | "completed" | "escalated"
  priority: "low" | "medium" | "high" | "critical"
  investigatorId: string
  investigatorName: string
  createdAt: string
  updatedAt: string
  notes: string[]
}
```

### Email
```typescript
{
  id: string
  messageId: string
  organizationId: string
  subject: string
  from: string
  to: string[]
  cc?: string[]
  date: string
  headers: Record<string, string>
  bodyPlain: string
  bodyHtml: string
  attachments: Attachment[]
  rawS3Key?: string
  createdAt: string
}
```

## Neo4j Graph Schema

### Nodes
- **User**: `{email, name?, orgId}`
- **Domain**: `{name, orgId}`
- **Email**: `{id, messageId, subject, sentAt, severity, riskScore, orgId}`
- **Attachment**: `{id, filename, mimeType, verdict}`
- **URL**: `{id, value, risk}`
- **Incident**: `{id, type, createdAt, severity}`

### Relationships
- `(User)-[:SENT]->(Email)` - User sent email
- `(Email)-[:TO]->(User)` - Email sent to user
- `(Email)-[:FROM_DOMAIN]->(Domain)` - Email from domain
- `(Email)-[:HAS_ATTACHMENT]->(Attachment)` - Email has attachment
- `(Email)-[:HAS_URL]->(URL)` - Email contains URL
- `(Email)-[:PART_OF_CAMPAIGN]->(Incident)` - Email part of campaign

**Note**: Current implementation uses `WAS_SENT`, `WAS_SENT_TO`, `CONTAINS_URL` - migration may be needed.

## Security Copilot (CopilotKit)

### Architecture
- **Runtime**: `/api/copilotkit` - Next.js route handler
- **Agent System**: `lib/agent.ts` - Multi-step ReAct-style agent
- **Streaming**: `lib/agent-stream.ts` - Server-sent events
- **UI Components**: 
  - `components/InvestigationCopilotPanel.tsx` - Per-investigation copilot
  - `components/command-center/copilot-shortcuts.tsx` - Global shortcuts

### Agent Tools
1. **inspect_schema** - View Neo4j schema
2. **run_cypher** - Execute read-only Cypher queries
3. **run_gds** - Run Graph Data Science algorithms

### CopilotKit Actions (to be implemented)
1. **getDetectionSummary** - Fetch detection details
2. **queryEmailGraph** - Query email relationship graph
3. **listSimilarIncidents** - Find similar incidents
4. **updateDetectionStatus** - Update detection status (with confirmation)

## Authentication & Authorization

### Auth Flow
- AWS Cognito for user authentication
- JWT tokens stored in localStorage
- Session management via `providers/SessionProvider.tsx`

### RBAC
- **Roles**: OrgAdmin, Analyst, Viewer
- **Permissions**: Defined in `types/roles.ts`
- Enforced in API handlers and middleware

## Email Ingestion Pipeline

### Flow
1. **SES** receives email → triggers Lambda
2. **Lambda** (`EncryptGateEmailIngest`) processes email:
   - Extracts headers, body, attachments
   - Runs threat detection
   - Stores in S3 (raw email)
   - Writes to DynamoDB (email + detection records)
   - Updates Neo4j graph
3. **Detection** created if threat detected
4. **Notification** sent to analysts

### Endpoints
- `POST /api/emails/ingest` - Entry point for ingestion
- `POST /api/threat-detection` - Threat analysis

## UI Components

### Layout
- **AppLayout** (`components/app-layout.tsx`):
  - Left sidebar: Navigation
  - Main content: Page content
  - Right rail: Command Center

### Command Center (Right Rail)
- Notifications
- Action Inbox
- Copilot Shortcuts
- Queue Snapshot
- Recent Items
- Context modules (per page)

### Pages
- **Dashboard**: Overview, stats, recent detections
- **Detections**: List with filters, search, actions
- **Investigations**: Investigation detail with copilot
- **All Emails**: Email list view

## Configuration

### Environment Variables
- `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` - Neo4j connection
- `OPENAI_API_KEY` - OpenAI API key (or Parameter Store)
- `AWS_REGION` - AWS region
- DynamoDB table names via env vars

### Parameter Store (AWS SSM)
- `encryptgate-neo4j-uri`
- `encryptgate-neo4j-user`
- `encryptgate-neo4j-password`
- `encryptgate-openai-api-key`

## Development

### Local Setup
See `docs/dev-setup.md` (to be created)

### Key Commands
- `npm run dev` - Start Next.js dev server
- `npm run build` - Build for production
- `python main.py` - Start Flask auth server (port 8000)

## Future Improvements

1. **Graph Schema Migration**: Standardize relationship names
2. **Email Ingestion**: Complete Lambda implementation
3. **CopilotKit Actions**: Implement function calling
4. **Real-time Updates**: WebSocket/SSE for live updates
5. **Advanced Analytics**: Dashboard charts, trend analysis
6. **Remediation Actions**: Auto-remediation workflows

