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

// IMPROVED: Better email body parsing with more robust fallbacks
function parseEmailBodyFromRaw(rawEmail: string): { body: string; bodyHtml?: string; headers: Record<string, string> } {
  console.log('📧 Parsing email body from raw content, length:', rawEmail.length)
  
  const lines = rawEmail.split('\n')
  const headers: Record<string, string> = {}
  let headerEndIndex = -1
  
  // Parse headers - stop at first blank line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    if (line.trim() === '') {
      headerEndIndex = i
      console.log('📧 Found header end at line:', i)
      break
    }
    
    // Handle header continuation lines
    if (line.startsWith(' ') || line.startsWith('\t')) {
      // This is a continuation of the previous header
      const lastHeaderKey = Object.keys(headers).pop()
      if (lastHeaderKey) {
        headers[lastHeaderKey] += ' ' + line.trim()
      }
    } else {
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).toLowerCase().trim()
        const value = line.substring(colonIndex + 1).trim()
        headers[key] = value
      }
    }
  }
  
  console.log('📧 Parsed headers:', Object.keys(headers).length)
  
  if (headerEndIndex === -1) {
    console.warn('📧 No header/body separator found, treating entire content as body')
    return {
      body: rawEmail,
      headers
    }
  }
  
  // Get everything after headers as potential body content
  const bodyContent = lines.slice(headerEndIndex + 1).join('\n')
  console.log('📧 Raw body content length after headers:', bodyContent.length)
  
  const contentType = headers['content-type'] || ''
  console.log('📧 Content-Type:', contentType)
  
  // Handle multipart content
  if (contentType.toLowerCase().includes('multipart')) {
    const boundaryMatch = contentType.match(/boundary[=\s]*["']?([^"'\s;]+)["']?/i)
    if (boundaryMatch) {
      const boundary = boundaryMatch[1]
      console.log('📧 Found multipart boundary:', boundary)
      
      const parts = bodyContent.split(`--${boundary}`)
      console.log('📧 Split into', parts.length, 'parts')
      
      let textPart = ''
      let htmlPart = ''
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim()
        if (part === '' || part === '--') continue
        
        console.log(`📧 Processing part ${i + 1}, length:`, part.length)
        
        const partLines = part.split('\n')
        let partHeaderEnd = -1
        const partHeaders: Record<string, string> = {}
        
        // Parse part headers
        for (let j = 0; j < partLines.length; j++) {
          const line = partLines[j]
          if (line.trim() === '') {
            partHeaderEnd = j
            break
          }
          const colonIndex = line.indexOf(':')
          if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).toLowerCase().trim()
            const value = line.substring(colonIndex + 1).trim()
            partHeaders[key] = value
          }
        }
        
        if (partHeaderEnd >= 0) {
          const partBody = partLines.slice(partHeaderEnd + 1).join('\n').trim()
          const partContentType = partHeaders['content-type'] || ''
          
          console.log(`📧 Part ${i + 1} content-type:`, partContentType, 'body length:', partBody.length)
          
          if (partContentType.toLowerCase().includes('text/plain') && partBody) {
            textPart = partBody
            console.log('📧 Found text/plain part, length:', textPart.length)
          } else if (partContentType.toLowerCase().includes('text/html') && partBody) {
            htmlPart = partBody
            console.log('📧 Found text/html part, length:', htmlPart.length)
          }
        }
      }
      
      // Return the parsed parts
      if (textPart || htmlPart) {
        console.log('📧 Multipart parsing successful:', { 
          textLength: textPart.length, 
          htmlLength: htmlPart.length 
        })
        return {
          body: textPart || htmlPart, // Prefer text, fallback to HTML
          bodyHtml: htmlPart || undefined,
          headers
        }
      }
    }
  }
  
  // Handle single-part content or multipart parsing failure
  console.log('📧 Using single-part parsing or multipart fallback')
  
  // Clean up the body content - remove only obvious email headers, not content
  let cleanBody = bodyContent
  
  // Only remove lines that look like email headers (have colons and are at the start)
  const bodyLines = cleanBody.split('\n')
  let contentStartIndex = 0
  
  // Skip only the first few lines if they look like headers that somehow leaked through
  for (let i = 0; i < Math.min(10, bodyLines.length); i++) {
    const line = bodyLines[i].trim()
    
    // If we find a line that doesn't look like a header, stop skipping
    if (line && !line.match(/^[A-Za-z-]+:\s/)) {
      contentStartIndex = i
      break
    }
    
    // If this looks like a header, continue
    if (line.match(/^(Message-ID|Subject|From|To|Date|MIME-Version|Content-Type|Content-Transfer-Encoding):/i)) {
      contentStartIndex = i + 1
      continue
    }
    
    // If we hit a blank line, content starts after it
    if (!line) {
      contentStartIndex = i + 1
      break
    }
    
    // If line doesn't match header pattern, this is content
    break
  }
  
  cleanBody = bodyLines.slice(contentStartIndex).join('\n').trim()
  
  console.log('📧 Single-part body processing:', {
    originalLength: bodyContent.length,
    cleanedLength: cleanBody.length,
    skippedLines: contentStartIndex,
    hasContent: cleanBody.length > 0
  })
  
  // Final fallback - if we still don't have content, use the original body content
  if (!cleanBody || cleanBody.length < 10) {
    console.warn('📧 Clean body too short, using original body content')
    cleanBody = bodyContent.trim()
  }
  
  // If it's HTML content, also set bodyHtml
  let bodyHtml: string | undefined
  if (contentType.toLowerCase().includes('text/html') || cleanBody.includes('<html') || cleanBody.includes('</html>')) {
    bodyHtml = cleanBody
    console.log('📧 Detected HTML content, setting bodyHtml')
  }
  
  return {
    body: cleanBody || 'No message content available',
    bodyHtml,
    headers
  }
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
    
    const parsed = parseEmailBodyFromRaw(raw)
    
    console.log(`✅ Parsed message: ${Object.keys(parsed.headers).length} headers, ${parsed.body.length} body chars, ${parsed.bodyHtml?.length || 0} HTML chars`)
    return { 
      headers: parsed.headers, 
      messageBody: parsed.body, 
      bodyHtml: parsed.bodyHtml || '' 
    }
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

    // IMPROVED: Get message body from Lambda's raw data with better parsing
    let headers: Record<string, string> = {}
    let messageBody = ''
    let bodyHtml = ''
    
    if (sesRecord.raw?.base64) {
      // Lambda provided raw message content
      try {
        const rawBuffer = Buffer.from(sesRecord.raw.base64, 'base64');
        const rawText = rawBuffer.toString('utf-8');
        console.log('📧 Raw email content received from Lambda:', {
          contentLength: rawText.length,
          contentPreview: rawText.substring(0, 200) + '...'
        });
        
        // Use the improved parsing function
        const parsed = parseEmailBodyFromRaw(rawText);
        headers = parsed.headers;
        messageBody = parsed.body;
        bodyHtml = parsed.bodyHtml || '';
        
        console.log('📧 Lambda content parsing results:', {
          hasHeaders: Object.keys(headers).length > 0,
          bodyLength: messageBody.length,
          bodyHtmlLength: bodyHtml.length,
          bodyPreview: messageBody.substring(0, 200) + (messageBody.length > 200 ? '...' : ''),
          hasValidContent: messageBody.length > 0 && messageBody.trim() !== ''
        });
        
      } catch (err: any) {
        console.error('❌ Error parsing Lambda raw content:', err);
        messageBody = `Email content parsing failed: ${err.message}`;
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

    // Final validation - ensure we have some body content
    if (!messageBody || messageBody.trim() === '' || messageBody === 'No message content available') {
      console.warn('📧 No valid body content found, using fallback');
      messageBody = `Email received and processed successfully.

Subject: ${mail.commonHeaders.subject || 'No Subject'}
From: ${mail.commonHeaders.from.join(', ')}
To: ${mail.commonHeaders.to.join(', ')}
Date: ${mail.timestamp}

The email body content could not be extracted. This may be due to:
- Complex email formatting
- Encrypted content
- Email processing limitations

Please check the original email for full content.`;
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
      console.log('📧 Pre-DynamoDB email data validation:', {
        messageId: emailItem.messageId,
        subject: emailItem.subject,
        bodyLength: emailItem.body?.length || 0,
        bodyHtmlLength: emailItem.bodyHtml?.length || 0,
        bodyPreview: emailItem.body?.substring(0, 100) || 'NO BODY',
        bodyIsValid: emailItem.body && emailItem.body.trim().length > 0
      });
      
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
      console.log('✅ Email stored successfully in DynamoDB with body content')
      
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

    console.log('🎉 Email processing complete with body content')
    return NextResponse.json({
      status: 'processed',
      messageId: emailItem.messageId,
      direction: emailItem.direction,
      threatsTriggered: hasThreat,
      webhookType: 'Lambda-Processed',
      userId: userId,
      bodyLength: emailItem.body.length,
      hasBodyContent: emailItem.body.length > 0,
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
      bodyParsingImproved: true,
      message: 'Production webhook with comprehensive filtering and improved body parsing - only Lambda-processed events allowed'
    })
  } catch(err) {
    console.error('❌ Health check failed', err)
    return NextResponse.json({ status:'unhealthy' }, { status:500 })
  }
}