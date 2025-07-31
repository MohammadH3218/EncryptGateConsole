// app/api/workmail-webhook/route.ts
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand
} from '@aws-sdk/client-dynamodb'
import {
  WorkMailMessageFlowClient,
  GetRawMessageContentCommand
} from '@aws-sdk/client-workmailmessageflow'
import { z } from 'zod'

// ─── ENVIRONMENT ───────────────────────────────────────────────────────────────
const ORG_ID            = process.env.ORGANIZATION_ID!
const CS_TABLE          = process.env.CLOUDSERVICES_TABLE_NAME || 'CloudServices'
const EMPLOYEES_TABLE   = process.env.EMPLOYEES_TABLE_NAME   || 'Employees'
const EMAILS_TABLE      = process.env.EMAILS_TABLE_NAME      || 'EmailMessages'
const BASE_URL          = process.env.BASE_URL               || 'https://console-encryptgate.net'
const AWS_REGION        = process.env.AWS_REGION!

const ddb = new DynamoDBClient({ region: AWS_REGION })

// ─── WEBHOOK PAYLOAD SCHEMA ────────────────────────────────────────────────────
const WorkMailWebhookSchema = z.object({
  notificationType: z.string(),
  mail: z.object({
    messageId: z.string(),
    timestamp: z.string(),
    source: z.string(),
    destination: z.array(z.string()),
    commonHeaders: z.object({
      from:    z.array(z.string()),
      to:      z.array(z.string()),
      subject: z.string().optional(),
    }),
  }),
})

// ─── HELPERS ───────────────────────────────────────────────────────────────────

// 1) Fetch WorkMail config from your CloudServices table
async function getWorkMailConfig() {
  const resp = await ddb.send(new QueryCommand({
    TableName: CS_TABLE,
    KeyConditionExpression:    'orgId = :orgId AND serviceType = :serviceType',
    ExpressionAttributeValues: {
      ':orgId':        { S: ORG_ID },
      ':serviceType':  { S: 'aws-workmail' },
    }
  }))
  if (!resp.Items?.length) {
    throw new Error('WorkMail not configured')
  }
  const item = resp.Items[0]
  return {
    organizationId: item.organizationId!.S!,
    region:         item.region!.S!
  }
}

// 2) Check if an address is a monitored employee
async function isMonitoredEmployee(email: string): Promise<boolean> {
  try {
    const resp = await ddb.send(new QueryCommand({
      TableName: CS_TABLE === EMPLOYEES_TABLE ? EMPLOYEES_TABLE : EMPLOYEES_TABLE,
      KeyConditionExpression:    'orgId = :orgId AND email = :email',
      ExpressionAttributeValues: {
        ':orgId':  { S: ORG_ID },
        ':email':  { S: email }
      }
    }))
    return Boolean(resp.Items?.length)
  } catch (err) {
    console.error('Error checking monitored employee:', err)
    return false
  }
}

// 3) Turn an async stream into a string
async function streamToString(stream: any): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

// 4) Parse the raw MIME into headers + body
async function parseRawMessage(
  mailClient: WorkMailMessageFlowClient,
  messageId: string
) {
  try {
    const resp = await mailClient.send(new GetRawMessageContentCommand({
      messageId
    }))
    if (!resp.messageContent) {
      throw new Error('No message content received')
    }
    const raw = await streamToString(resp.messageContent)
    const lines = raw.split('\n')
    let inBody = false
    const headers: Record<string,string> = {}
    let body = ''

    for (const line of lines) {
      if (!inBody) {
        if (line.trim() === '') {
          inBody = true
          continue
        }
        const idx = line.indexOf(':')
        if (idx > 0) {
          const key = line.slice(0, idx).toLowerCase()
          const val = line.slice(idx + 1).trim()
          headers[key] = val
        }
      } else {
        body += line + '\n'
      }
    }
    return { headers, messageBody: body.trim() }
  } catch (err) {
    console.error('Error parsing raw message:', err)
    return { headers: {}, messageBody: '' }
  }
}

// 5) Extract URLs
function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi
  return text.match(re) || []
}

// 6) Simple keyword‐based threat check
function containsSuspiciousKeywords(body: string): boolean {
  const suspicious = [
    'urgent', 'verify account',
    'immediate action', 'suspended',
    'click here', 'confirm identity',
    'prize', 'winner', 'limited time'
  ]
  const lower = body.toLowerCase()
  return suspicious.some(k => lower.includes(k))
}

// ─── MAIN WEBHOOK HANDLER ──────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    console.log('📥 WorkMail webhook received')
    const json = await req.json()
    const { notificationType, mail } = WorkMailWebhookSchema.parse(json)

    if (notificationType !== 'Delivery') {
      console.log('⚠️  Ignoring non-Delivery notification')
      return NextResponse.json({ status: 'ignored' })
    }

    // who sent and who receives
    const sender     = mail.commonHeaders.from[0] || mail.source
    const recipients = mail.commonHeaders.to.length
      ? mail.commonHeaders.to
      : mail.destination

    // skip if nobody monitored
    const fromMon = await isMonitoredEmployee(sender)
    const toMons  = await Promise.all(recipients.map(isMonitoredEmployee))
    if (!fromMon && !toMons.some(Boolean)) {
      console.log('ℹ️  No monitored address. Skipping.')
      return NextResponse.json({ status: 'skipped' })
    }

    // fetch WorkMail config & raw content
    const { organizationId, region } = await getWorkMailConfig()
    const mailClient = new WorkMailMessageFlowClient({ region })
    const { headers, messageBody } = await parseRawMessage(
      mailClient,
      mail.messageId
    )

    // build our envelope
    const isOutbound = fromMon
    const urls       = extractUrls(messageBody)
    const threats    = urls.length > 0 || containsSuspiciousKeywords(messageBody)

    const emailItem = {
      messageId:  mail.messageId,
      sender,
      recipients,
      subject:    mail.commonHeaders.subject || 'No Subject',
      timestamp:  mail.timestamp,
      body:       messageBody,
      bodyHtml:   messageBody,
      headers,
      attachments: [] as string[],
      direction:  isOutbound ? 'outbound' : 'inbound',
      size:       messageBody.length,
      urls,
      threat:     threats
    }

    // ─── 1) Store in DynamoDB EMAILS_TABLE ──────────────────────────────────
    try {
      await ddb.send(new PutItemCommand({
        TableName: EMAILS_TABLE,
        Item: {
          messageId:  { S: emailItem.messageId },
          sender:     { S: emailItem.sender },
          recipients: { SS: emailItem.recipients },
          subject:    { S: emailItem.subject },
          body:       { S: emailItem.body },
          bodyHtml:   { S: emailItem.bodyHtml },
          timestamp:  { S: emailItem.timestamp },
          direction:  { S: emailItem.direction },
          size:       { N: emailItem.size.toString() },
          urls:       { SS: emailItem.urls },
          threat:     { BOOL: emailItem.threat },
          headers:    { S: JSON.stringify(emailItem.headers) },
          attachments:{ SS: emailItem.attachments },
        }
      }))
      console.log('✅ Persisted to DynamoDB')
    } catch (err) {
      console.error('❌ DynamoDB write failed:', err)
    }

    // ─── 2) Forward for further processing ──────────────────────────────────
    try {
      await fetch(`${BASE_URL}/api/email-processor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'raw_email', ...emailItem })
      })
      console.log('➡️  Forwarded to /api/email-processor')
    } catch (err) {
      console.error('❌ /api/email-processor failed:', err)
    }

    // ─── 3) Run threat‐detection if needed ───────────────────────────────────
    if (threats) {
      try {
        await fetch(`${BASE_URL}/api/threat-detection`, {
          method: 'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({
            messageId: emailItem.messageId,
            sender,
            recipients,
            subject: emailItem.subject,
            body: emailItem.body,
            timestamp: emailItem.timestamp,
            urls
          })
        })
        console.log('🚨 Threat detection triggered')
      } catch (err) {
        console.error('❌ threat-detection failed:', err)
      }
    }

    // ─── 4) Update your graph DB ────────────────────────────────────────────
    try {
      await fetch(`${BASE_URL}/api/graph`, {
        method: 'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          action: 'add_email',
          data: {
            messageId: emailItem.messageId,
            sender,
            recipients,
            subject:    emailItem.subject,
            body:       emailItem.body,
            timestamp:  emailItem.timestamp,
            urls
          }
        })
      })
      console.log('🌐 Graph DB updated')
    } catch (err) {
      console.error('❌ Graph update failed:', err)
    }

    // ─── DONE ────────────────────────────────────────────────────────────────
    return NextResponse.json({
      status:           'processed',
      messageId:        emailItem.messageId,
      threatsTriggered: threats
    })

  } catch (err: any) {
    console.error('❌ WorkMail webhook error:', err)
    return NextResponse.json(
      { error: 'Webhook processing failed', message: err.message },
      { status: 500 }
    )
  }
}

// GET for health‐check
export async function GET() {
  return NextResponse.json({ status: 'webhook_ready' })
}
