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
    let currentHeader = ''
    let headerEndIndex = -1
    const headers: Record<string, string> = {}
    
    // Parse headers first
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      if (line.trim() === '') {
        headerEndIndex = i
        break
      }
      
      if (line.startsWith(' ') || line.startsWith('\t')) {
        // Continuation of previous header
        if (currentHeader) {
          headers[currentHeader] += ' ' + line.trim()
        }
      } else {
        const colonIndex = line.indexOf(':')
        if (colonIndex > 0) {
          currentHeader = line.substring(0, colonIndex).toLowerCase()
          headers[currentHeader] = line.substring(colonIndex + 1).trim()
        }
      }
    }
    
    console.log(`📧 Parsed headers: ${Object.keys(headers).length}`)
    
    // Parse body content
    let body = ''
    let bodyHtml = ''
    
    if (headerEndIndex >= 0) {
      const bodyContent = lines.slice(headerEndIndex + 1).join('\n')
      console.log(`📧 Body content length: ${bodyContent.length}`)
      
      // Check if this is multipart content
      const contentType = headers['content-type'] || ''
      if (contentType.includes('multipart')) {
        // Extract boundary
        const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/)
        if (boundaryMatch) {
          const boundary = boundaryMatch[1]
          console.log(`📧 Found multipart boundary: ${boundary}`)
          
          const parts = bodyContent.split(`--${boundary}`)
          console.log(`📧 Found ${parts.length} parts`)
          
          for (const part of parts) {
            if (part.trim() === '' || part.trim() === '--') continue
            
            const partLines = part.split('\n')
            let partHeaderEndIndex = -1
            const partHeaders: Record<string, string> = {}
            
            // Parse part headers
            for (let i = 0; i < partLines.length; i++) {
              const line = partLines[i]
              if (line.trim() === '') {
                partHeaderEndIndex = i
                break
              }
              const colonIndex = line.indexOf(':')
              if (colonIndex > 0) {
                const key = line.substring(0, colonIndex).toLowerCase()
                const value = line.substring(colonIndex + 1).trim()
                partHeaders[key] = value
              }
            }
            
            if (partHeaderEndIndex >= 0) {
              const partContent = partLines.slice(partHeaderEndIndex + 1).join('\n').trim()
              const partContentType = partHeaders['content-type'] || ''
              
              if (partContentType.includes('text/plain')) {
                body = partContent
                console.log(`📧 Found plain text body, length: ${body.length}`)
              } else if (partContentType.includes('text/html')) {
                bodyHtml = partContent
                console.log(`📧 Found HTML body, length: ${bodyHtml.length}`)
              }
            }
          }
        }
      } else {
        // Single part content
        body = bodyContent.trim()
        console.log(`📧 Single part body, length: ${body.length}`)
      }
    }
    
    // Fallback if no body content found
    if (!body && !bodyHtml) {
      body = 'No message content available'
      console.log('⚠️ No body content found, using fallback')
    }
    
    const messageBody = body || bodyHtml || 'No content available'
    
    console.log(`✅ Parsed message: ${Object.keys(headers).length} headers, ${messageBody.length} body chars`)
    return { headers, messageBody, bodyHtml }
  } catch (err) {
    console.error('❌ Error parsing raw message:', err)
    return { headers: {}, messageBody: '', bodyHtml: '' }
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
    
    // ═════════════════════════════════════════════════════════════════
    // 🚫 IMMEDIATE DUPLICATE PREVENTION - FILTER AT THE TOP
    // ═════════════════════════════════════════════════════════════════
    
    const isSes = !!raw?.Records?.[0]?.ses?.mail;
    const isWorkMail = !!raw?.summaryVersion && !!raw?.messageId && !!raw?.envelope;
    
    // Check if this is from our Lambda function (has 'workmail' property)
    const isFromLambda = !!raw?.Records?.[0]?.ses?.workmail;
    
    console.log('🔍 Webhook source analysis:', {
      isSes: isSes && !isFromLambda,
      isWorkMailDirect: isWorkMail,
      isFromLambda,
      flowDirection: raw?.flowDirection || raw?.Records?.[0]?.ses?.workmail?.flowDirection,
      messageId: raw?.messageId || raw?.Records?.[0]?.ses?.mail?.messageId
    });

    // FILTER 1: Skip direct SES webhooks (but allow Lambda-processed ones)
    if (isSes && !isFromLambda) {
      console.log('🚫 FILTERED: Direct SES webhook - skipping to prevent duplicates');
      return NextResponse.json({
        status: 'filtered_out',
        reason: 'direct_ses_webhook_skipped',
        message: 'Direct SES webhooks are filtered - only Lambda-processed events allowed'
      });
    }

    // FILTER 2: Skip direct WorkMail OUTBOUND events
    if (isWorkMail && raw.flowDirection === 'OUTBOUND') {
      console.log('🚫 FILTERED: Direct WorkMail OUTBOUND - skipping to prevent duplicates');
      return NextResponse.json({
        status: 'filtered_out', 
        reason: 'workmail_outbound_skipped',
        message: 'WorkMail OUTBOUND events are filtered to prevent duplicates'
      });
    }

    // FILTER 3: Skip direct WorkMail INBOUND events (only allow Lambda-processed)
    if (isWorkMail && raw.flowDirection === 'INBOUND') {
      console.log('🚫 FILTERED: Direct WorkMail INBOUND - skipping to prevent duplicates');
      return NextResponse.json({
        status: 'filtered_out',
        reason: 'workmail_inbound_skipped', 
        message: 'Direct WorkMail INBOUND events are filtered - only Lambda-processed events allowed'
      });
    }

    // ONLY ALLOW: Lambda-processed events (SES events with workmail property)
    if (!isFromLambda) {
      console.log('🚫 FILTERED: Not from Lambda - only Lambda-processed events allowed');
      return NextResponse.json({
        status: 'filtered_out',
        reason: 'not_from_lambda',
        message: 'Only Lambda-processed events are allowed to prevent duplicates'
      });
    }

    console.log('✅ FILTER PASSED: Processing Lambda-processed email event');
    
    // ═════════════════════════════════════════════════════════════════
    // PROCESS THE LAMBDA-PROCESSED EMAIL EVENT
    // ═════════════════════════════════════════════════════════════════

    const safeFirst = (arr: any) => Array.isArray(arr) && arr.length ? arr[0] : undefined

    const extractEmail = (s: string): string => {
      if (!s) return ""
      const m = s.match(/<([^>]+)>/)
      return (m ? m[1] : s).trim()
    }

    // Process the Lambda-wrapped SES event
    const sesRecord = raw.Records[0].ses;
    const normalized = {
      notificationType: 'Delivery',
      mail: {
        messageId: sesRecord.mail.messageId,
        timestamp: sesRecord.mail.timestamp,
        source: (Array.isArray(sesRecord.mail.commonHeaders?.from) && sesRecord.mail.commonHeaders.from[0]) || sesRecord.mail.source || "",
        destination: sesRecord.mail.destination || [],
        commonHeaders: {
          from: sesRecord.mail.commonHeaders?.from || [],
          to: sesRecord.mail.commonHeaders?.to || [],
          subject: sesRecord.mail.commonHeaders?.subject || ""
        }
      }
    };

    console.log('🔄 Processing Lambda-wrapped event:', {
      messageId: normalized.mail.messageId,
      subject: normalized.mail.commonHeaders.subject,
      flowDirection: sesRecord.workmail?.flowDirection
    });

    try {
      const { notificationType, mail } = WorkMailWebhookSchema.parse(normalized)
      console.log('✅ Schema validation passed')
    } catch (schemaError: any) {
      console.error('❌ Schema validation failed:', schemaError.message)
      throw new Error(`Schema validation failed: ${schemaError.message}`)
    }

    const { notificationType, mail } = WorkMailWebhookSchema.parse(normalized)

    if (notificationType !== 'Delivery') {
      console.log(`⚠️ Ignoring non-Delivery: ${notificationType}`)
      return NextResponse.json({ status:'ignored', reason:'not-delivery' })
    }

    console.log('📧 Processing email:', mail.messageId)
    
    const rawSender = mail.commonHeaders.from[0] || mail.source
    const rawRecipients = mail.commonHeaders.to.length ? mail.commonHeaders.to : mail.destination
    
    const sender = extractEmail(rawSender)
    const recipients = rawRecipients.map(extractEmail)
    
    console.log('📧 Extracted addresses:', {
      sender,
      recipients,
      messageId: mail.messageId
    })

    // Check if we have valid participants
    if (!sender && recipients.length === 0) {
      console.log('⚠️ No valid sender or recipients found')
      return NextResponse.json({ status: 'skipped', reason: 'no-parties' })
    }

    const fromMon = await isMonitoredEmployee(sender)
    const toMons = await Promise.all(recipients.map(isMonitoredEmployee))
    
    if (!(fromMon || toMons.some(x=>x))) {
      console.log('ℹ️ No monitored participants, skipping')
      return NextResponse.json({
        status:'skipped',
        reason:'no-monitored-users',
        participants:{ sender, recipients }
      })
    }

    // Get message body from Lambda's raw data or fetch from WorkMail
    let headers: Record<string, string> = {}
    let messageBody = ''
    let bodyHtml = ''
    
    if (sesRecord.raw?.base64) {
      // Lambda provided raw message content
      try {
        const rawBuffer = Buffer.from(sesRecord.raw.base64, 'base64');
        const rawText = rawBuffer.toString('utf-8');
        const lines = rawText.split('\n');
        let inBody = false;
        
        for (const line of lines) {
          if (!inBody) {
            if (line.trim() === '') {
              inBody = true;
              continue;
            }
            const idx = line.indexOf(':');
            if (idx > 0) {
              headers[line.slice(0, idx).toLowerCase()] = line.slice(idx + 1).trim();
            }
          } else {
            messageBody += line + '\n';
          }
        }
        messageBody = messageBody.trim();
        console.log('📧 Using Lambda-provided raw message content');
      } catch (err) {
        console.error('❌ Error parsing Lambda raw content:', err);
        messageBody = `Email processed via Lambda function.

Subject: ${mail.commonHeaders.subject || 'No Subject'}
From: ${mail.commonHeaders.from.join(', ')}
To: ${mail.commonHeaders.to.join(', ')}
Date: ${mail.timestamp}

[Email body content processed by Lambda function]`;
      }
    } else {
      // Fallback to WorkMail API
      try {
        const { region } = await getWorkMailConfig()
        const mailClient = new WorkMailMessageFlowClient({ region })
        const parsed = await parseRawMessage(mailClient, mail.messageId)
        headers = parsed.headers
        messageBody = parsed.messageBody
        bodyHtml = parsed.bodyHtml || ''
        if (bodyHtml) {
          console.log('📧 HTML body extracted from WorkMail API');
        }
      } catch (err) {
        console.error('❌ Error fetching from WorkMail:', err);
        messageBody = `Email processed via WorkMail webhook.

Subject: ${mail.commonHeaders.subject || 'No Subject'}
From: ${mail.commonHeaders.from.join(', ')}
To: ${mail.commonHeaders.to.join(', ')}
Date: ${mail.timestamp}

[Email body content not available]`;
      }
    }

    // Determine direction from Lambda workmail metadata
    const isOutbound = sesRecord.workmail?.flowDirection === 'OUTBOUND';
    const userId = isOutbound ? sender : (recipients[toMons.findIndex(Boolean)] ?? recipients[0]);

    console.log('📧 Email direction and userId:', {
      isOutbound,
      flowDirection: sesRecord.workmail?.flowDirection,
      userId
    });

    const urls = extractUrls(messageBody)
    const hasThreat = urls.length > 0 || containsSuspiciousKeywords(messageBody)

    const emailItem = {
      messageId: mail.messageId,
      sender,
      recipients,
      subject: mail.commonHeaders.subject || 'No Subject',
      timestamp: mail.timestamp,
      body: messageBody,
      bodyHtml: bodyHtml || messageBody,
      headers,
      attachments: [] as string[],
      direction: isOutbound ? 'outbound' : 'inbound',
      size: messageBody.length,
      urls,
      hasThreat
    }

    // Store in DynamoDB
    try {
      console.log(`💾 Writing email to DynamoDB table ${EMAILS_TABLE}`)
      const dbItem: Record<string, any> = {
        userId: { S: userId },
        receivedAt: { S: emailItem.timestamp },
        messageId: { S: emailItem.messageId },
        emailId: { S: `email-${Date.now()}-${Math.random().toString(36).slice(2,8)}` },
        sender: { S: emailItem.sender || '' },
        subject: { S: emailItem.subject || 'No Subject' },
        body: { S: emailItem.body || '' },
        bodyHtml: { S: emailItem.bodyHtml || '' },
        direction: { S: emailItem.direction },
        size: { N: String(emailItem.size || 0) },
        status: { S: 'received' },
        threatLevel: { S: 'none' },
        isPhishing: { BOOL: false },
        createdAt: { S: new Date().toISOString() },
        
        // NEW ATTRIBUTES - Set defaults for new email attributes
        flaggedCategory: { S: 'none' },          // Default: 'none' (not flagged)
        updatedAt: { S: new Date().toISOString() } // Track last update
      }

      if (recipients.length) dbItem.recipients = { SS: recipients }
      if (emailItem.attachments?.length) dbItem.attachments = { SS: emailItem.attachments }
      if (emailItem.urls?.length) dbItem.urls = { SS: emailItem.urls }
      if (headers && Object.keys(headers).length) {
        dbItem.headers = { S: JSON.stringify(headers) }
      }

      await ddb.send(new PutItemCommand({
        TableName: EMAILS_TABLE,
        Item: dbItem,
        ConditionExpression: 'attribute_not_exists(messageId)'
      }))
      console.log('✅ Email stored successfully in DynamoDB')
      
    } catch(err: any) {
      if (err.name === 'ConditionalCheckFailedException') {
        console.log('ℹ️ Email already exists, skipping duplicate:', emailItem.messageId)
        return NextResponse.json({
          status: 'duplicate_skipped',
          reason: 'email_already_exists',
          messageId: emailItem.messageId
        })
      } else {
        console.error('❌ DynamoDB write failed', err)
        throw err
      }
    }

    // Trigger threat detection if needed
    if (hasThreat) {
      try {
        await fetch(`${BASE_URL}/api/threat-detection`, {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify(emailItem)
        })
      } catch{}
    }

    // Update graph
    try {
      await fetch(`${BASE_URL}/api/graph`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ action:'add_email', data: emailItem })
      })
    } catch{}

    console.log('🎉 Email processing complete')
    return NextResponse.json({
      status: 'processed',
      messageId: emailItem.messageId,
      direction: emailItem.direction,
      threatsTriggered: hasThreat,
      webhookType: 'Lambda-Processed',
      userId: userId,
      filtersApplied: ['DIRECT_SES_FILTER', 'DIRECT_WORKMAIL_FILTER', 'LAMBDA_ONLY_FILTER'],
      processingNote: 'Only Lambda-processed events allowed - all direct webhooks filtered out'
    })

  } catch(err: any) {
    console.error('❌ Webhook processing failed:', err)
    return NextResponse.json(
      { 
        error: 'Webhook processing failed', 
        message: err.message,
        stack: err.stack?.split('\n').slice(0, 3)
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  console.log('🏥 Health check')
  try {
    await ddb.send(new QueryCommand({
      TableName: CS_TABLE,
      KeyConditionExpression: 'orgId = :orgId',
      ExpressionAttributeValues: { ':orgId': { S: ORG_ID } },
      Limit: 1
    }))
    return NextResponse.json({ 
      status: 'webhook_ready',
      duplicatePreventionActive: true,
      filtersActive: ['DIRECT_SES_FILTER', 'DIRECT_WORKMAIL_FILTER', 'LAMBDA_ONLY_FILTER'],
      message: 'Production webhook with comprehensive filtering - only Lambda-processed events allowed'
    })
  } catch(err) {
    console.error('❌ Health check failed', err)
    return NextResponse.json({ status:'unhealthy' }, { status:500 })
  }
}