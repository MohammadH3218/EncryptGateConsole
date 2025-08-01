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
const ORG_ID            = process.env.ORGANIZATION_ID      || 'default-org';
const CS_TABLE          = process.env.CLOUDSERVICES_TABLE || 'CloudServices';
const EMPLOYEES_TABLE   = process.env.EMPLOYEES_TABLE_NAME || 'Employees';
const EMAILS_TABLE      = process.env.EMAILS_TABLE_NAME    || 'Emails';
const BASE_URL          = process.env.BASE_URL             || 'https://console-encryptgate.net';
const AWS_REGION        = process.env.AWS_REGION           || 'us-east-1';

console.log('📧 WorkMail Webhook initialized:', {
  ORG_ID,
  CS_TABLE,
  EMPLOYEES_TABLE,
  EMAILS_TABLE,
  BASE_URL,
  AWS_REGION
})

if (!process.env.ORGANIZATION_ID) {
  console.warn('⚠️ ORGANIZATION_ID not set, using default fallback');
}

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
  console.log('🔍 Fetching WorkMail configuration...')
  const resp = await ddb.send(new QueryCommand({
    TableName: CS_TABLE,
    KeyConditionExpression:    'orgId = :orgId AND serviceType = :serviceType',
    ExpressionAttributeValues: {
      ':orgId':        { S: ORG_ID },
      ':serviceType':  { S: 'aws-workmail' },
    }
  }))
  
  if (!resp.Items?.length) {
    console.error('❌ No WorkMail configuration found in DynamoDB')
    throw new Error('WorkMail not configured')
  }
  
  const item = resp.Items[0]
  const config = {
    organizationId: item.organizationId!.S!,
    region:         item.region!.S!
  }
  
  console.log('✅ WorkMail config found:', config)
  return config
}

// 2) Check if an address is a monitored employee
async function isMonitoredEmployee(email: string): Promise<boolean> {
  try {
    console.log(`🔍 Checking if ${email} is monitored...`)
    const resp = await ddb.send(new QueryCommand({
      TableName: EMPLOYEES_TABLE,
      KeyConditionExpression:    'orgId = :orgId AND email = :email',
      ExpressionAttributeValues: {
        ':orgId':  { S: ORG_ID },
        ':email':  { S: email }
      }
    }))
    
    const isMonitored = Boolean(resp.Items?.length)
    console.log(`${isMonitored ? '✅' : '❌'} ${email} is ${isMonitored ? '' : 'not '}monitored`)
    return isMonitored
  } catch (err) {
    console.error('❌ Error checking monitored employee:', err)
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
    console.log(`📧 Fetching raw message content for: ${messageId}`)
    const resp = await mailClient.send(new GetRawMessageContentCommand({
      messageId
    }))
    
    if (!resp.messageContent) {
      throw new Error('No message content received')
    }
    
    const raw = await streamToString(resp.messageContent)
    console.log(`📄 Raw message size: ${raw.length} characters`)
    
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
    
    console.log(`✅ Parsed message: ${Object.keys(headers).length} headers, ${body.length} body chars`)
    return { headers, messageBody: body.trim() }
  } catch (err) {
    console.error('❌ Error parsing raw message:', err)
    return { headers: {}, messageBody: '' }
  }
}

// 5) Extract URLs
function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi
  const urls = text.match(re) || []
  console.log(`🔗 Found ${urls.length} URLs in message`)
  return urls
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
  const found = suspicious.filter(k => lower.includes(k))
  
  if (found.length > 0) {
    console.log(`⚠️ Found suspicious keywords: ${found.join(', ')}`)
  }
  
  return found.length > 0
}

// ─── MAIN WEBHOOK HANDLER ──────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    console.log('📥 WorkMail webhook received')
    const json = await req.json()
    console.log('📨 Webhook payload:', JSON.stringify(json, null, 2))
    
    const { notificationType, mail } = WorkMailWebhookSchema.parse(json)

    if (notificationType !== 'Delivery') {
      console.log(`⚠️ Ignoring non-Delivery notification: ${notificationType}`)
      return NextResponse.json({ status: 'ignored', reason: 'not-delivery' })
    }

    console.log('📧 Processing email delivery notification:', {
      messageId: mail.messageId,
      timestamp: mail.timestamp,
      source: mail.source,
      destinations: mail.destination
    })

    // who sent and who receives
    const sender = mail.commonHeaders.from[0] || mail.source
    const recipients = mail.commonHeaders.to.length
      ? mail.commonHeaders.to
      : mail.destination

    console.log('👥 Email participants:', { sender, recipients })

    // Check if anyone involved is monitored
    const fromMon = await isMonitoredEmployee(sender)
    const toMons = await Promise.all(recipients.map(isMonitoredEmployee))
    const anyMonitored = fromMon || toMons.some(Boolean)

    if (!anyMonitored) {
      console.log('ℹ️ No monitored addresses involved. Skipping processing.')
      return NextResponse.json({ 
        status: 'skipped', 
        reason: 'no-monitored-users',
        participants: { sender, recipients }
      })
    }

    console.log('✅ Found monitored participants, processing email...')

    // fetch WorkMail config & raw content
    const { organizationId, region } = await getWorkMailConfig()
    const mailClient = new WorkMailMessageFlowClient({ region })
    const { headers, messageBody } = await parseRawMessage(
      mailClient,
      mail.messageId
    )

    // build our envelope
    const isOutbound = fromMon
    const urls = extractUrls(messageBody)
    const hasSuspiciousContent = urls.length > 0 || containsSuspiciousKeywords(messageBody)

    const emailItem = {
      messageId: mail.messageId,
      sender,
      recipients,
      subject: mail.commonHeaders.subject || 'No Subject',
      timestamp: mail.timestamp,
      body: messageBody,
      bodyHtml: messageBody, // Could parse HTML separately if needed
      headers,
      attachments: [] as string[],
      direction: isOutbound ? 'outbound' : 'inbound',
      size: messageBody.length,
      urls,
      hasThreat: hasSuspiciousContent
    }

    console.log('📝 Email data prepared:', {
      messageId: emailItem.messageId,
      subject: emailItem.subject,
      sender: emailItem.sender,
      recipients: emailItem.recipients,
      direction: emailItem.direction,
      bodyLength: emailItem.body.length,
      urlCount: emailItem.urls.length,
      hasThreat: emailItem.hasThreat
    })

    // ─── 1) Store in DynamoDB EMAILS_TABLE ──────────────────────────────────
    try {
      console.log(`💾 Storing email in DynamoDB table: ${EMAILS_TABLE}`)
      const dbItem: Record<string, any> = {
        messageId: { S: emailItem.messageId },
        emailId: { S: `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` },
        sender: { S: emailItem.sender },
        recipients: { SS: emailItem.recipients },
        subject: { S: emailItem.subject },
        body: { S: emailItem.body },
        bodyHtml: { S: emailItem.bodyHtml },
        timestamp: { S: emailItem.timestamp },
        direction: { S: emailItem.direction },
        size: { N: emailItem.size.toString() },
        status: { S: 'received' },
        threatLevel: { S: 'none' }, // Will be updated by threat detection
        isPhishing: { BOOL: false },
        headers: { S: JSON.stringify(emailItem.headers) },
        attachments: { SS: emailItem.attachments },
        createdAt: { S: new Date().toISOString() }
      };

      // Only add orgId if we have a real organization ID
      if (ORG_ID !== 'default-org') {
        dbItem.orgId = { S: ORG_ID };
      }

      // Only add URLs if there are any
      if (emailItem.urls.length > 0) {
        dbItem.urls = { SS: emailItem.urls };
      }

      await ddb.send(new PutItemCommand({
        TableName: EMAILS_TABLE,
        Item: dbItem
      }))
      console.log('✅ Email stored in DynamoDB successfully')
    } catch (err) {
      console.error('❌ DynamoDB storage failed:', err)
      // Continue processing even if storage fails
    }

    // ─── 2) Forward for further processing ──────────────────────────────────
    try {
      console.log('🔄 Forwarding to email processor...')
      const processorResponse = await fetch(`${BASE_URL}/api/email-processor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          type: 'raw_email', 
          ...emailItem 
        })
      })
      
      if (processorResponse.ok) {
        console.log('✅ Email processor completed successfully')
      } else {
        console.error('❌ Email processor failed:', await processorResponse.text())
      }
    } catch (err) {
      console.error('❌ Email processor request failed:', err)
    }

    // ─── 3) Run threat‐detection if needed ───────────────────────────────────
    if (hasSuspiciousContent) {
      try {
        console.log('🚨 Running threat detection...')
        const threatResponse = await fetch(`${BASE_URL}/api/threat-detection`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
        
        if (threatResponse.ok) {
          console.log('✅ Threat detection completed')
        } else {
          console.error('❌ Threat detection failed:', await threatResponse.text())
        }
      } catch (err) {
        console.error('❌ Threat detection request failed:', err)
      }
    }

    // ─── 4) Update your graph DB ────────────────────────────────────────────
    try {
      console.log('🌐 Updating graph database...')
      const graphResponse = await fetch(`${BASE_URL}/api/graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_email',
          data: {
            messageId: emailItem.messageId,
            sender,
            recipients,
            subject: emailItem.subject,
            body: emailItem.body,
            timestamp: emailItem.timestamp,
            urls
          }
        })
      })
      
      if (graphResponse.ok) {
        console.log('✅ Graph database updated')
      } else {
        console.error('❌ Graph database update failed:', await graphResponse.text())
      }
    } catch (err) {
      console.error('❌ Graph database request failed:', err)
    }

    // ─── DONE ────────────────────────────────────────────────────────────────
    console.log('🎉 WorkMail webhook processing completed successfully')
    
    return NextResponse.json({
      status: 'processed',
      messageId: emailItem.messageId,
      subject: emailItem.subject,
      participants: { sender, recipients },
      direction: emailItem.direction,
      threatsTriggered: hasSuspiciousContent,
      processing: {
        stored: true,
        processed: true,
        threatAnalyzed: hasSuspiciousContent,
        graphUpdated: true
      }
    })

  } catch (err: any) {
    console.error('❌ WorkMail webhook processing failed:', {
      message: err.message,
      name: err.name,
      stack: err.stack?.split('\n').slice(0, 5)
    })
    
    return NextResponse.json(
      { 
        error: 'Webhook processing failed', 
        message: err.message,
        type: err.name
      },
      { status: 500 }
    )
  }
}

// GET for health‐check
export async function GET() {
  console.log('🏥 WorkMail webhook health check')
  
  try {
    // Test database connection
    const testQuery = await ddb.send(new QueryCommand({
      TableName: CS_TABLE,
      KeyConditionExpression: 'orgId = :orgId',
      ExpressionAttributeValues: {
        ':orgId': { S: ORG_ID }
      },
      Limit: 1
    }))
    
    console.log('✅ Database connection test passed')
    
    return NextResponse.json({ 
      status: 'webhook_ready',
      timestamp: new Date().toISOString(),
      environment: {
        orgId: ORG_ID,
        region: AWS_REGION,
        tables: {
          cloudServices: CS_TABLE,
          employees: EMPLOYEES_TABLE,
          emails: EMAILS_TABLE
        }
      },
      database: {
        connected: true,
        testQuery: testQuery.Count !== undefined
      }
    })
  } catch (err) {
    console.error('❌ Health check failed:', err)
    return NextResponse.json(
      { 
        status: 'unhealthy', 
        error: err instanceof Error ? err.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}