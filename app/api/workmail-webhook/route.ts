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

console.log('📧 WorkMail Webhook initialized with improved body extraction v7.0:', {
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

// IMPROVED: Comprehensive email body parsing from raw MIME content
function parseEmailBodyFromRaw(rawEmail: string): { body: string; bodyHtml?: string; headers: Record<string, string> } {
  console.log('📧 IMPROVED: Parsing email body from raw content, length:', rawEmail.length);
  
  const lines = rawEmail.split('\n');
  const headers: Record<string, string> = {};
  let headerEndIndex = -1;
  
  // More robust header parsing
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Empty line marks end of headers
    if (trimmedLine === '' || line === '\r' || trimmedLine === '\r') {
      headerEndIndex = i;
      console.log('📧 Found header end at line:', i);
      break;
    }
    
    // Handle header continuation lines
    if ((line.startsWith(' ') || line.startsWith('\t')) && i > 0) {
      const lastHeaderKey = Object.keys(headers).pop();
      if (lastHeaderKey) {
        headers[lastHeaderKey] += ' ' + trimmedLine;
      }
    } else {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).toLowerCase().trim();
        const value = line.substring(colonIndex + 1).trim();
        headers[key] = value;
      }
    }
  }
  
  console.log('📧 Parsed headers:', Object.keys(headers).length);
  
  if (headerEndIndex === -1) {
    console.warn('📧 No header/body separator found, trying heuristic approach');
    // Try to find where headers likely end
    for (let i = 5; i < Math.min(50, lines.length); i++) {
      const line = lines[i].trim();
      if (line && !line.match(/^[A-Za-z-]+:\s/) && !line.startsWith(' ') && !line.startsWith('\t')) {
        headerEndIndex = i - 1;
        console.log('📧 Heuristic header end at line:', headerEndIndex);
        break;
      }
    }
    if (headerEndIndex === -1) {
      headerEndIndex = 10; // Fallback
    }
  }
  
  // Get everything after headers as potential body content
  let bodyContent = lines.slice(headerEndIndex + 1).join('\n');
  console.log('📧 Raw body content length after headers:', bodyContent.length);
  
  const contentType = (headers['content-type'] || '').toLowerCase();
  const transferEncoding = (headers['content-transfer-encoding'] || '').toLowerCase();
  console.log('📧 Content-Type:', contentType);
  console.log('📧 Transfer-Encoding:', transferEncoding);
  
  // Handle multipart content
  if (contentType.includes('multipart')) {
    const boundaryMatch = contentType.match(/boundary[=\s]*["']?([^"'\s;]+)["']?/i);
    if (boundaryMatch) {
      const boundary = boundaryMatch[1];
      console.log('📧 Found multipart boundary:', boundary);
      
      const parts = bodyContent.split(`--${boundary}`);
      console.log('📧 Split into', parts.length, 'parts');
      
      let textPart = '';
      let htmlPart = '';
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        if (part === '' || part === '--') continue;
        
        console.log(`📧 Processing part ${i + 1}, length:`, part.length);
        
        const partLines = part.split('\n');
        let partHeaderEnd = -1;
        const partHeaders: Record<string, string> = {};
        
        // Parse part headers
        for (let j = 0; j < partLines.length; j++) {
          const line = partLines[j];
          if (line.trim() === '' || line === '\r') {
            partHeaderEnd = j;
            break;
          }
          const colonIndex = line.indexOf(':');
          if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).toLowerCase().trim();
            const value = line.substring(colonIndex + 1).trim();
            partHeaders[key] = value;
          }
        }
        
        if (partHeaderEnd >= 0) {
          let partBody = partLines.slice(partHeaderEnd + 1).join('\n').trim();
          const partContentType = (partHeaders['content-type'] || '').toLowerCase();
          const partTransferEncoding = (partHeaders['content-transfer-encoding'] || '').toLowerCase();
          
          console.log(`📧 Part ${i + 1} content-type:`, partContentType, 'body length:', partBody.length);
          
          // Handle part encoding
          if (partTransferEncoding === 'quoted-printable') {
            partBody = partBody
              .replace(/=\r?\n/g, '')
              .replace(/=([0-9A-F]{2})/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
            console.log('📧 Decoded quoted-printable part');
          } else if (partTransferEncoding === 'base64') {
            try {
              partBody = Buffer.from(partBody.replace(/\s/g, ''), 'base64').toString('utf8');
              console.log('📧 Decoded base64 part');
            } catch (e) {
              console.warn('📧 Failed to decode base64 part:', (e as Error).message);
            }
          }
          
          if (partContentType.includes('text/plain') && partBody) {
            textPart = partBody;
            console.log('📧 Found text/plain part, length:', textPart.length);
          } else if (partContentType.includes('text/html') && partBody) {
            htmlPart = partBody;
            console.log('📧 Found text/html part, length:', htmlPart.length);
          } else if (partContentType.includes('text/') && partBody && !textPart) {
            textPart = partBody;
            console.log('📧 Using generic text part as fallback');
          }
        }
      }
      
      // Return the best content we found
      if (textPart) {
        console.log('📧 Multipart parsing successful, using text part:', textPart.length);
        return {
          body: textPart,
          bodyHtml: htmlPart || undefined,
          headers
        };
      } else if (htmlPart) {
        console.log('📧 Multipart parsing successful, using HTML part (converted):', htmlPart.length);
        const plainFromHtml = htmlPart
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ')
          .replace(/\n\s+/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        
        return {
          body: plainFromHtml,
          bodyHtml: htmlPart,
          headers
        };
      }
    }
  }
  
  // Handle single-part content or multipart parsing failure
  console.log('📧 Using single-part parsing');
  
  // Handle encoding for single-part content
  if (transferEncoding === 'quoted-printable') {
    bodyContent = bodyContent
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
    console.log('📧 Decoded quoted-printable content');
  } else if (transferEncoding === 'base64') {
    try {
      bodyContent = Buffer.from(bodyContent.replace(/\s/g, ''), 'base64').toString('utf8');
      console.log('📧 Decoded base64 content');
    } catch (e) {
      console.warn('📧 Failed to decode base64 content:', (e as Error).message);
    }
  }
  
  // Aggressive header removal for single-part
  const bodyLines = bodyContent.split('\n');
  let cleanLines: string[] = [];
  let foundContent = false;
  
  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i];
    const trimmedLine = line.trim();
    
    // Skip empty lines at the beginning
    if (!foundContent && !trimmedLine) {
      continue;
    }
    
    // Check if this line looks like a header
    const isHeaderLine = /^[A-Za-z-][A-Za-z0-9-]*:\s/.test(trimmedLine);
    const isCommonEmailHeader = /^(Message-ID|Subject|From|To|Date|MIME-Version|Content-Type|Content-Transfer-Encoding|Received|Return-Path|X-|DKIM-|Authentication-Results|List-|Reply-To|CC|BCC|Delivered-To):/i.test(trimmedLine);
    
    // If we haven't found content yet and this looks like a header, skip it
    if (!foundContent && (isHeaderLine || isCommonEmailHeader)) {
      console.log('📧 Skipping header line:', trimmedLine.substring(0, 50) + '...');
      continue;
    }
    
    // This should be content
    foundContent = true;
    cleanLines.push(line);
  }
  
  let cleanBody = cleanLines.join('\n').trim();
  
  // Additional cleanup for single-part
  const finalLines = cleanBody.split('\n');
  let finalStartIndex = 0;
  
  // Remove any remaining header-like lines from the beginning
  for (let i = 0; i < Math.min(10, finalLines.length); i++) {
    const line = finalLines[i].trim();
    if (!line) {
      finalStartIndex = i + 1;
      continue;
    }
    
    // If this still looks like a header, skip it
    if (/^[A-Za-z-][A-Za-z0-9-]*:\s/.test(line) || 
        /^(MIME-Version|Content-|X-):/i.test(line)) {
      console.log('📧 Removing residual header:', line.substring(0, 50) + '...');
      finalStartIndex = i + 1;
      continue;
    }
    
    // This is content, stop here
    break;
  }
  
  cleanBody = finalLines.slice(finalStartIndex).join('\n').trim();
  
  // Handle HTML content
  let bodyHtml: string | undefined;
  if (contentType.includes('text/html') || cleanBody.includes('<html') || cleanBody.includes('</html>')) {
    bodyHtml = cleanBody;
    // Convert HTML to plain text for body
    cleanBody = cleanBody
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  
  // Final validation and cleanup
  cleanBody = cleanBody
    .replace(/^\s*[\r\n]+/gm, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  console.log('📧 Body content after aggressive header removal:', {
    originalLength: bodyContent.length,
    cleanedLength: cleanBody.length,
    linesRemoved: bodyLines.length - cleanLines.length + finalStartIndex,
    hasContent: cleanBody.length > 0,
    preview: cleanBody.substring(0, 200) + (cleanBody.length > 200 ? '...' : '')
  });
  
  // Final fallback if we still don't have good content
  if (!cleanBody || cleanBody.length < 10) {
    console.warn('📧 Minimal content found, trying emergency extraction');
    
    // Try to find any meaningful text in the entire raw email
    const allLines = rawEmail.split('\n');
    const possibleContent: string[] = [];
    
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim();
      if (line && 
          line.length > 15 && 
          !line.match(/^[A-Za-z-]+:\s/) && 
          !line.startsWith('--') &&
          !line.match(/^[A-Z0-9+\/=]{20,}$/) && // Skip base64 chunks
          !line.includes('boundary=')) {
        possibleContent.push(line);
      }
    }
    
    if (possibleContent.length > 0) {
      cleanBody = possibleContent.join('\n').trim();
      console.log('📧 Emergency extraction found content, length:', cleanBody.length);
    } else {
      cleanBody = 'This email appears to contain no readable text content.';
      console.log('📧 No readable content found, using fallback message');
    }
  }
  
  return {
    body: cleanBody || 'No message content available',
    bodyHtml,
    headers
  };
}

// IMPROVED: Enhanced raw message parsing with better error handling
async function parseRawMessage(
  mailClient: WorkMailMessageFlowClient,
  messageId: string
) {
  try {
    console.log(`📧 IMPROVED: Fetching raw message content for: ${messageId}`)
    const resp = await mailClient.send(new GetRawMessageContentCommand({ messageId }))
    
    if (!resp.messageContent) {
      throw new Error('No message content received')
    }
    
    const raw = await streamToString(resp.messageContent)
    console.log(`📄 Raw message size: ${raw.length} characters`)
    
    const parsed = parseEmailBodyFromRaw(raw)
    
    console.log(`✅ Parsed message successfully:`, {
      headersCount: Object.keys(parsed.headers).length,
      bodyLength: parsed.body.length,
      hasHtml: !!parsed.bodyHtml,
      htmlLength: parsed.bodyHtml?.length || 0
    })
    
    return { 
      headers: parsed.headers, 
      messageBody: parsed.body, 
      bodyHtml: parsed.bodyHtml || '' 
    }
  } catch (err: any) {
    console.error('❌ Error parsing raw message:', err)
    return { 
      headers: {}, 
      messageBody: `Failed to extract email content: ${err.message}`, 
      bodyHtml: '' 
    }
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
    console.log('📥 WorkMail webhook received with improved body extraction v7.0')
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

    console.log('✅ FILTER PASSED: Processing Lambda-processed email event with improved extraction v7.0');
    
    // ═════════════════════════════════════════════════════════════════
    // PROCESS THE LAMBDA-PROCESSED EMAIL EVENT
    // ═════════════════════════════════════════════════════════════════

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

    console.log('🔄 Processing Lambda-wrapped event with improved body extraction v7.0:', {
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

    console.log('📧 Processing email with improved extraction v7.0:', mail.messageId)
    
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

    // IMPROVED: Get message body from Lambda's raw data with comprehensive parsing
    let headers: Record<string, string> = {}
    let messageBody = ''
    let bodyHtml = ''
    
    if (sesRecord.raw?.base64) {
      // Lambda provided raw message content
      try {
        const rawBuffer = Buffer.from(sesRecord.raw.base64, 'base64');
        const rawText = rawBuffer.toString('utf-8');
        console.log('📧 Raw email content received from Lambda v7.0:', {
          contentLength: rawText.length,
          contentPreview: rawText.substring(0, 200) + '...'
        });
        
        // Use the improved parsing function
        const parsed = parseEmailBodyFromRaw(rawText);
        headers = parsed.headers;
        messageBody = parsed.body;
        bodyHtml = parsed.bodyHtml || '';
        
        console.log('📧 Lambda content parsing results with improved extraction v7.0:', {
          hasHeaders: Object.keys(headers).length > 0,
          bodyLength: messageBody.length,
          bodyHtmlLength: bodyHtml.length,
          bodyPreview: messageBody.substring(0, 200) + (messageBody.length > 200 ? '...' : ''),
          hasValidContent: messageBody.length > 0 && messageBody.trim() !== '' && !messageBody.includes('This email appears to contain no readable text content')
        });
        
      } catch (err: any) {
        console.error('❌ Error parsing Lambda raw content v7.0:', err);
        messageBody = `Email content parsing failed: ${err.message}`;
      }
    } else {
      // Fallback to WorkMail API with improved parsing
      try {
        const { region } = await getWorkMailConfig()
        const mailClient = new WorkMailMessageFlowClient({ region })
        const parsed = await parseRawMessage(mailClient, mail.messageId)
        headers = parsed.headers
        messageBody = parsed.messageBody
        bodyHtml = parsed.bodyHtml || ''
        console.log('📧 WorkMail API extraction with improved parsing v7.0 completed');
      } catch (err: any) {
        console.error('❌ Error fetching from WorkMail with improved parsing v7.0:', err);
        messageBody = `Email processed via WorkMail webhook.

Subject: ${mail.commonHeaders.subject || 'No Subject'}
From: ${mail.commonHeaders.from.join(', ')}
To: ${mail.commonHeaders.to.join(', ')}
Date: ${mail.timestamp}

[Email body content extraction failed with improved parsing v7.0 - check logs for details]`;
      }
    }

    // Final validation with improved logic - ensure we have some meaningful body content
    if (!messageBody || 
        messageBody.trim() === '' || 
        messageBody === 'No message content available' ||
        messageBody === 'This email appears to contain no readable text content.' ||
        messageBody.includes('Failed to extract email content')) {
      console.warn('📧 No valid body content found after improved extraction v7.0, using enhanced fallback');
      messageBody = `Email received and processed successfully.

Subject: ${mail.commonHeaders.subject || 'No Subject'}
From: ${mail.commonHeaders.from.join(', ')}
To: ${mail.commonHeaders.to.join(', ')}
Date: ${mail.timestamp}

The email body content could not be extracted using our improved parsing system v7.0. This may be due to:
- Highly complex email formatting
- Unusual encoding or compression
- Email processing system limitations

The email headers and metadata were processed successfully. Consider checking the original email source for full content.`;
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

    // Store in DynamoDB with improved content
    try {
      console.log('📧 Pre-DynamoDB email data validation with improved extraction v7.0:', {
        messageId: emailItem.messageId,
        subject: emailItem.subject,
        bodyLength: emailItem.body?.length || 0,
        bodyHtmlLength: emailItem.bodyHtml?.length || 0,
        bodyPreview: emailItem.body?.substring(0, 100) || 'NO BODY',
        bodyIsValid: emailItem.body && emailItem.body.trim().length > 0,
        isImprovedExtraction: !emailItem.body.includes('Email content extraction incomplete')
      });
      
      console.log(`💾 Writing email to DynamoDB table ${EMAILS_TABLE} with improved body content v7.0`)
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
      console.log('✅ Email stored successfully in DynamoDB with improved body content v7.0')
      
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

    console.log('🎉 Email processing complete with improved body content extraction v7.0')
    return NextResponse.json({
      status: 'processed',
      messageId: emailItem.messageId,
      direction: emailItem.direction,
      threatsTriggered: hasThreat,
      webhookType: 'Lambda-Processed-Improved-v7.0',
      userId: userId,
      bodyLength: emailItem.body.length,
      hasBodyContent: emailItem.body.length > 0,
      isImprovedExtraction: !emailItem.body.includes('Email content extraction incomplete'),
      filtersApplied: ['DIRECT_SES_FILTER', 'DIRECT_WORKMAIL_FILTER', 'LAMBDA_ONLY_FILTER'],
      extractionVersion: 'v7.0-improved',
      processingNote: 'Lambda-processed events with comprehensive body extraction v7.0 - all direct webhooks filtered out'
    })

  } catch(err: any) {
    console.error('❌ Webhook processing failed v7.0:', err)
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
  console.log('🏥 Health check - Improved Body Extraction v7.0')
  try {
    await ddb.send(new QueryCommand({
      TableName: CS_TABLE,
      KeyConditionExpression: 'orgId = :orgId',
      ExpressionAttributeValues: { ':orgId': { S: ORG_ID } },
      Limit: 1
    }))
    return NextResponse.json({ 
      status: 'webhook_ready',
      version: 'v7.0-improved-body-extraction',
      duplicatePreventionActive: true,
      filtersActive: ['DIRECT_SES_FILTER', 'DIRECT_WORKMAIL_FILTER', 'LAMBDA_ONLY_FILTER'],
      bodyParsingImproved: true,
      extractionFeatures: [
        'comprehensive-mime-parsing',
        'multipart-boundary-detection',
        'quoted-printable-decoding',
        'base64-decoding',
        'html-to-text-conversion',
        'aggressive-header-removal',
        'emergency-fallback-extraction'
      ],
      message: 'Production webhook with comprehensive filtering and significantly improved body parsing v7.0 - only Lambda-processed events allowed'
    })
  } catch(err) {
    console.error('❌ Health check failed', err)
    return NextResponse.json({ status:'unhealthy' }, { status:500 })
  }
}