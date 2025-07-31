// app/api/workmail-webhook/route.ts
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb'
import { WorkMailClient, GetRawMessageContentCommand } from '@aws-sdk/client-workmail'
import { z } from 'zod'

// Environment variables
const ORG_ID = process.env.ORGANIZATION_ID!
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || 'CloudServices'
const EMPLOYEES_TABLE = process.env.EMPLOYEES_TABLE_NAME || 'Employees'
const BASE_URL = process.env.BASE_URL || 'https://console-encryptgate.net'

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION })

// WorkMail webhook payload schema
const WorkMailWebhookSchema = z.object({
  notificationType: z.string(),
  mail: z.object({
    messageId: z.string(),
    timestamp: z.string(),
    source: z.string(),
    destination: z.array(z.string()),
    commonHeaders: z.object({
      from: z.array(z.string()),
      to: z.array(z.string()),
      subject: z.string().optional(),
    }),
  }),
})

// Get WorkMail configuration
async function getWorkMailConfig() {
  const resp = await ddb.send(
    new QueryCommand({
      TableName: CS_TABLE,
      KeyConditionExpression: 'orgId = :orgId AND serviceType = :serviceType',
      ExpressionAttributeValues: {
        ':orgId': { S: ORG_ID },
        ':serviceType': { S: 'aws-workmail' },
      },
    })
  )

  if (!resp.Items || resp.Items.length === 0) {
    throw new Error('WorkMail not configured')
  }

  const item = resp.Items[0]
  return {
    organizationId: item.organizationId?.S!,
    region: item.region?.S!,
  }
}

// Check if sender/recipient is monitored
async function isMonitoredEmployee(email: string): Promise<boolean> {
  try {
    const resp = await ddb.send(
      new QueryCommand({
        TableName: EMPLOYEES_TABLE,
        KeyConditionExpression: 'orgId = :orgId AND email = :email',
        ExpressionAttributeValues: {
          ':orgId': { S: ORG_ID },
          ':email': { S: email },
        },
      })
    )
    return resp.Items && resp.Items.length > 0
  } catch (error) {
    console.error('Error checking monitored employee:', error)
    return false
  }
}

// Extract URLs from email content
function extractUrls(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi
  return content.match(urlRegex) || []
}

// Parse email headers and body from raw message
async function parseRawMessage(workmail: WorkMailClient, orgId: string, messageId: string) {
  try {
    const response = await workmail.send(
      new GetRawMessageContentCommand({
        OrganizationId: orgId,
        MessageId: messageId,
      })
    )

    if (!response.MessageContent) {
      throw new Error('No message content received')
    }

    // Convert stream to string
    const messageContent = await streamToString(response.MessageContent)
    
    // Basic email parsing (in production, use a proper email parser like 'mailparser')
    const lines = messageContent.split('\n')
    let headersParsed = false
    let body = ''
    const headers: Record<string, string> = {}

    for (const line of lines) {
      if (!headersParsed) {
        if (line.trim() === '') {
          headersParsed = true
          continue
        }
        
        const colonIndex = line.indexOf(':')
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).toLowerCase()
          const value = line.substring(colonIndex + 1).trim()
          headers[key] = value
        }
      } else {
        body += line + '\n'
      }
    }

    return { headers, body: body.trim() }
  } catch (error) {
    console.error('Error parsing raw message:', error)
    return { headers: {}, body: '' }
  }
}

async function streamToString(stream: any): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

// Main webhook handler
export async function POST(req: Request) {
  try {
    console.log('📧 WorkMail webhook received')
    
    const body = await req.json()
    const webhook = WorkMailWebhookSchema.parse(body)
    
    console.log('📧 Processing WorkMail notification:', webhook.notificationType)

    // Only process mail delivery notifications
    if (webhook.notificationType !== 'Delivery') {
      console.log('ℹ️ Ignoring non-delivery notification')
      return NextResponse.json({ status: 'ignored' })
    }

    const mail = webhook.mail
    const sender = mail.commonHeaders.from[0] || mail.source
    const recipients = mail.commonHeaders.to || mail.destination

    console.log(`📧 Email from ${sender} to ${recipients.join(', ')}`)

    // Check if any participant is monitored
    const senderMonitored = await isMonitoredEmployee(sender)
    const recipientsMonitored = await Promise.all(
      recipients.map(email => isMonitoredEmployee(email))
    )

    if (!senderMonitored && !recipientsMonitored.some(Boolean)) {
      console.log('ℹ️ No monitored employees involved, skipping email')
      return NextResponse.json({ status: 'skipped' })
    }

    // Get WorkMail configuration
    const { organizationId, region } = await getWorkMailConfig()
    const workmail = new WorkMailClient({ region })

    // Parse the raw message for full content
    const { headers, body } = await parseRawMessage(workmail, organizationId, mail.messageId)
    
    // Extract URLs from body
    const urls = extractUrls(body)
    
    // Create email payload for processing
    const emailPayload = {
      type: 'raw_email' as const,
      messageId: mail.messageId,
      subject: mail.commonHeaders.subject || 'No Subject',
      sender,
      recipients,
      timestamp: mail.timestamp,
      body,
      bodyHtml: body, // In a real implementation, you'd parse HTML separately
      attachments: [], // Would need to parse attachments from raw message
      headers,
      direction: senderMonitored ? 'outbound' : 'inbound' as const,
      size: body.length,
      urls, // Add URLs for graph database
    }

    console.log('📧 Forwarding email for processing...')

    // Forward to email processor for storage and analysis
    const processorResponse = await fetch(`${BASE_URL}/api/email-processor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload),
    })

    if (!processorResponse.ok) {
      console.error('❌ Email processor failed:', await processorResponse.text())
      throw new Error('Email processing failed')
    }

    // If email contains URLs or looks suspicious, trigger threat analysis
    if (urls.length > 0 || containsSuspiciousKeywords(body)) {
      console.log('🚨 Triggering threat analysis...')
      
      try {
        await fetch(`${BASE_URL}/api/threat-detection`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId: mail.messageId,
            sender,
            recipients,
            subject: emailPayload.subject,
            body,
            timestamp: mail.timestamp,
            urls,
          }),
        })
      } catch (threatError) {
        console.error('❌ Threat analysis failed:', threatError)
        // Don't fail the webhook for threat analysis errors
      }
    }

    // Add to graph database
    try {
      await fetch(`${BASE_URL}/api/graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_email',
          data: {
            messageId: mail.messageId,
            sender,
            recipients,
            subject: emailPayload.subject,
            body,
            timestamp: mail.timestamp,
            urls,
          },
        }),
      })
    } catch (graphError) {
      console.error('❌ Graph database update failed:', graphError)
      // Don't fail the webhook for graph database errors
    }

    console.log('✅ Email processed successfully')
    return NextResponse.json({ 
      status: 'processed',
      messageId: mail.messageId,
      threatsTriggered: urls.length > 0 || containsSuspiciousKeywords(body)
    })

  } catch (error: any) {
    console.error('❌ WorkMail webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed', message: error.message },
      { status: 500 }
    )
  }
}

// Simple suspicious keyword detection
function containsSuspiciousKeywords(body: string): boolean {
  const suspiciousKeywords = [
    'urgent', 'immediate action', 'verify account', 'suspended',
    'click here', 'update payment', 'confirm identity', 'tax refund',
    'prize', 'winner', 'congratulations', 'limited time',
  ]
  
  const lowerBody = body.toLowerCase()
  return suspiciousKeywords.some(keyword => lowerBody.includes(keyword))
}

// GET endpoint for webhook verification (if needed)
export async function GET(req: Request) {
  // Handle subscription confirmation if using SNS
  return NextResponse.json({ status: 'webhook_ready' })
}