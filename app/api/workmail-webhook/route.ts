export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  GetItemCommand
} from '@aws-sdk/client-dynamodb'
import {
  WorkMailMessageFlowClient,
  GetRawMessageContentCommand
} from '@aws-sdk/client-workmailmessageflow'
import { z } from 'zod'

const ORG_ID          = process.env.ORGANIZATION_ID      || 'default-org'
const CS_TABLE        = process.env.CLOUDSERVICES_TABLE  || 'CloudServices'
const EMPLOYEES_TABLE = process.env.EMPLOYEES_TABLE_NAME || 'Employees'
const EMAILS_TABLE    = process.env.EMAILS_TABLE_NAME    || 'Emails'
const BASE_URL        = process.env.BASE_URL             || 'https://console-encryptgate.net'
const AWS_REGION      = process.env.AWS_REGION           || 'us-east-1'

console.log('📧 WorkMail Webhook initialized:', {
  ORG_ID,
  CS_TABLE,
  EMPLOYEES_TABLE,
  EMAILS_TABLE,
  BASE_URL,
  AWS_REGION
})

if (!process.env.ORGANIZATION_ID) {
  console.warn('⚠️ ORGANIZATION_ID not set, using default fallback')
}

const ddb = new DynamoDBClient({ region: AWS_REGION })

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
      subject: z.string().optional()
    })
  })
})


async function getWorkMailConfig() {
  console.log('🔍 Fetching WorkMail configuration...')
  const resp = await ddb.send(new QueryCommand({
    TableName: CS_TABLE,
    KeyConditionExpression:    'orgId = :orgId AND serviceType = :serviceType',
    ExpressionAttributeValues: {
      ':orgId':       { S: ORG_ID },
      ':serviceType': { S: 'aws-workmail' }
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

async function isMonitoredEmployee(email: string): Promise<boolean> {
  try {
    console.log(`🔍 Checking if ${email} is monitored...`)
    
    // Direct key lookup instead of query with filter
    const resp = await ddb.send(new GetItemCommand({
      TableName: EMPLOYEES_TABLE,
      Key: {
        orgId: { S: ORG_ID },
        email: { S: email }
      }
    }))
    
    const isMonitored = Boolean(resp.Item)
    console.log(`${isMonitored ? '✅' : '❌'} ${email} is ${isMonitored ? '' : 'not '}monitored`)
    
    if (isMonitored) {
      console.log(`📋 Employee details:`, {
        name: resp.Item?.name?.S,
        department: resp.Item?.department?.S,
        status: resp.Item?.status?.S
      })
    }
    
    return isMonitored
  } catch (err) {
    console.error('❌ Error checking monitored employee:', err)
    return false
  }
}

async function streamToString(stream: any): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

async function parseRawMessage(
  mailClient: WorkMailMessageFlowClient,
  messageId: string
) {
  try {
    console.log(`📧 Fetching raw message content for: ${messageId}`)
    const resp = await mailClient.send(new GetRawMessageContentCommand({ messageId }))
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
          headers[line.slice(0, idx).toLowerCase()] = line.slice(idx + 1).trim()
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

function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi
  const urls = text.match(re) || []
  console.log(`🔗 Found ${urls.length} URLs in message`)
  return urls
}

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

export async function POST(req: Request) {
  try {
    console.log('📥 WorkMail webhook received')
    const raw = await req.json()
    console.log('📨 Webhook payload:', JSON.stringify(raw, null,2))
    
    const safeFirst = (arr: any) => Array.isArray(arr) && arr.length ? arr[0] : undefined

    const extractEmail = (s: string): string => {
      if (!s) return ""
      const m = s.match(/<([^>]+)>/)
      return (m ? m[1] : s).trim()
    }

    const isSes = !!raw?.Records?.[0]?.ses?.mail;
    const isWorkMail = !!raw?.summaryVersion && !!raw?.messageId && !!raw?.envelope;

    const normalized = isSes
      ? {
          notificationType: 'Delivery',
          mail: {
            messageId: raw.Records[0].ses.mail.messageId,
            timestamp: raw.Records[0].ses.mail.timestamp,
            source:
              (Array.isArray(raw.Records[0].ses.mail.commonHeaders?.from) &&
               raw.Records[0].ses.mail.commonHeaders.from[0]) ||
              raw.Records[0].ses.mail.source ||
              "",
            destination: raw.Records[0].ses.mail.destination || [],
            commonHeaders: {
              from: raw.Records[0].ses.mail.commonHeaders?.from || [],
              to:   raw.Records[0].ses.mail.commonHeaders?.to   || [],
              subject: raw.Records[0].ses.mail.commonHeaders?.subject || ""
            }
          }
        }
      : isWorkMail
        ? {
            notificationType: 'Delivery',
            mail: {
              messageId: raw.messageId,
              timestamp: new Date().toISOString(),
              source:
                (Array.isArray(raw.headers?.from) && raw.headers.from[0]) ??
                raw?.envelope?.mailFrom?.address ??
                "",
              destination: (raw.envelope?.recipients || []).map((r: any) => r.address),
              commonHeaders: {
                from: raw.headers?.from || (raw.envelope?.mailFrom ? [raw.envelope.mailFrom.address] : []),
                to:   raw.headers?.to   || (raw.envelope?.recipients || []).map((r: any) => r.address),
                subject: raw.subject || ""
              }
            }
          }
        : raw;

    console.log('🔄 Normalized payload:', JSON.stringify(normalized, null, 2))

    try {
      const { notificationType, mail } = WorkMailWebhookSchema.parse(normalized)
      console.log('✅ Schema validation passed')
    } catch (schemaError: any) {
      console.error('❌ Schema validation failed:', schemaError.message)
      console.error('❌ Schema errors:', JSON.stringify(schemaError.errors || schemaError, null, 2))
      throw new Error(`Schema validation failed: ${schemaError.message}`)
    }

    const { notificationType, mail } = WorkMailWebhookSchema.parse(normalized)

    if (notificationType !== 'Delivery') {
      console.log(`⚠️ Ignoring non-Delivery: ${notificationType}`)
      return NextResponse.json({ status:'ignored', reason:'not-delivery' })
    }

    console.log('📧 Processing email:', mail.messageId)
    
    const rawSender = mail.commonHeaders.from[0] || mail.source
    const rawRecipients = mail.commonHeaders.to.length
      ? mail.commonHeaders.to
      : mail.destination
    
    const sender = extractEmail(rawSender)
    const recipients = rawRecipients.map(extractEmail)
    
    console.log('📧 Extracted addresses:', {
      rawSender,
      extractedSender: sender,
      rawRecipients,
      extractedRecipients: recipients
    })

    // Check if we have valid participants before proceeding
    if (!sender && recipients.length === 0) {
      console.log('⚠️ No valid sender or recipients found')
      return NextResponse.json({ status: 'skipped', reason: 'no-parties' })
    }

    const fromMon = await isMonitoredEmployee(sender)
    const toMons  = await Promise.all(recipients.map(isMonitoredEmployee))
    if (!(fromMon || toMons.some(x=>x))) {
      console.log('ℹ️ No monitored participants, skipping')
      return NextResponse.json({
        status:'skipped',
        reason:'no-monitored-users',
        participants:{ sender, recipients }
      })
    }

    let headers: Record<string, string> = {}
    let messageBody = ''
    
    if (raw.Records?.[0]?.ses) {
      const sesRecord = raw.Records[0].ses
      
      if (sesRecord.mail.headers) {
        sesRecord.mail.headers.forEach((header: any) => {
          headers[header.name.toLowerCase()] = header.value
        })
      }
      
      messageBody = `Email received via SES webhook processing.
      
Subject: ${mail.commonHeaders.subject || 'No Subject'}
From: ${mail.commonHeaders.from.join(', ')}
To: ${mail.commonHeaders.to.join(', ')}
Date: ${headers.date || mail.timestamp}

[Email body content not available in SES webhook - email was processed through Amazon SES]`
      
      console.log('📧 Using SES webhook data (no raw message content available)')
    } else {
      const { region } = await getWorkMailConfig()
      const mailClient = new WorkMailMessageFlowClient({ region })
      const parsed = await parseRawMessage(mailClient, mail.messageId)
      headers = parsed.headers
      messageBody = parsed.messageBody
    }

    const isOutbound = fromMon
    const userId = isOutbound
      ? sender
      : recipients[toMons.findIndex(Boolean)] ?? recipients[0]

    const urls      = extractUrls(messageBody)
    const hasThreat = urls.length > 0 || containsSuspiciousKeywords(messageBody)

    const emailItem = {
      messageId: mail.messageId,
      sender,
      recipients,
      subject:   mail.commonHeaders.subject || 'No Subject',
      timestamp: mail.timestamp,
      body:      messageBody,
      bodyHtml:  messageBody,
      headers,
      attachments: [] as string[],
      direction:   isOutbound ? 'outbound' : 'inbound',
      size:        messageBody.length,
      urls,
      hasThreat
    }

    try {
      console.log(`💾 Writing to DynamoDB table ${EMAILS_TABLE}`)
      const dbItem: Record<string, any> = {
        userId:     { S: userId },
        receivedAt: { S: emailItem.timestamp },
        messageId:  { S: emailItem.messageId },
        emailId:    { S: `email-${Date.now()}-${Math.random().toString(36).slice(2,8)}` },
        sender:     { S: emailItem.sender || '' },
        subject:    { S: emailItem.subject || 'No Subject' },
        body:       { S: emailItem.body || '' },
        bodyHtml:   { S: emailItem.bodyHtml || '' },
        direction:  { S: emailItem.direction },
        size:       { N: String(emailItem.size || 0) },
        status:     { S: 'received' },
        threatLevel:{ S: 'none' },
        isPhishing: { BOOL: false },
        createdAt:  { S: new Date().toISOString() }
      }

      if (recipients.length)              dbItem.recipients  = { SS: recipients }
      if (emailItem.attachments?.length)  dbItem.attachments = { SS: emailItem.attachments }
      if (emailItem.urls?.length)         dbItem.urls        = { SS: emailItem.urls }
      if (headers && Object.keys(headers).length) {
        dbItem.headers = { S: JSON.stringify(headers) }
      }

      await ddb.send(new PutItemCommand({
        TableName: EMAILS_TABLE,
        Item:      dbItem,
        ConditionExpression: 'attribute_not_exists(messageId)'
      }))
      console.log('✅ DynamoDB write succeeded')
    } catch(err: any) {
      if (err.name === 'ConditionalCheckFailedException') {
        console.log('ℹ️ Email already exists, skipping duplicate:', emailItem.messageId)
        // Continue processing without error - email already stored
      } else {
        console.error('❌ DynamoDB write failed', err)
        throw err // Re-throw other errors
      }
    }


    if (hasThreat) {
      try {
        await fetch(`${BASE_URL}/api/threat-detection`, {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify(emailItem)
        })
      } catch{}
    }

    try {
      await fetch(`${BASE_URL}/api/graph`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ action:'add_email', data: emailItem })
      })
    } catch{}

    console.log('🎉 Processing complete')
    return NextResponse.json({
      status:           'processed',
      messageId:        emailItem.messageId,
      direction:        emailItem.direction,
      threatsTriggered: hasThreat
    })

  } catch(err:any) {
    console.error('❌ Webhook failed:', err)
    return NextResponse.json(
      { error:'Webhook processing failed', message:err.message },
      { status:500 }
    )
  }
}

export async function GET() {
  console.log('🏥 Health check')
  try {
    await ddb.send(new QueryCommand({
      TableName: CS_TABLE,
      KeyConditionExpression:    'orgId = :orgId',
      ExpressionAttributeValues: { ':orgId': { S: ORG_ID } },
      Limit: 1
    }))
    return NextResponse.json({ status:'webhook_ready' })
  } catch(err) {
    console.error('❌ Health check failed', err)
    return NextResponse.json({ status:'unhealthy' }, { status:500 })
  }
}