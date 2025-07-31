// app/api/workmail-webhook/route.ts
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb'
import { WorkMailClient } from '@aws-sdk/client-workmail'
import {
  WorkMailMessageFlowClient,
  GetRawMessageContentCommand,
} from '@aws-sdk/client-workmailmessageflow'
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
    return Boolean(resp.Items && resp.Items.length)
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

// Convert stream to string helper - MOVED BEFORE parseRawMessage
async function streamToString(stream: any): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

// Parse raw message using the MessageFlow client
async function parseRawMessage(
  mailClient: WorkMailMessageFlowClient,
  orgId: string,
  messageId: string
) {
  try {
    const response = await mailClient.send(
      new GetRawMessageContentCommand({
        messageId: messageId,
      })
    )

    // FIXED: Use lowercase 'messageContent' instead of 'MessageContent'
    if (!response.messageContent) {
      throw new Error('No message content received')
    }

    const messageContent = await streamToString(response.messageContent)

    // Simple parsing; for prod use a proper parser
    const lines = messageContent.split('\n')
    let headersParsed = false
    let messageBody = ''
    const headers: Record<string, string> = {}

    for (const line of lines) {
      if (!headersParsed) {
        if (line.trim() === '') {
          headersParsed = true
          continue
        }
        const idx = line.indexOf(':')
        if (idx > 0) {
          const key = line.substring(0, idx).toLowerCase()
          const val = line.substring(idx + 1).trim()
          headers[key] = val
        }
      } else {
        messageBody += line + '\n'
      }
    }

    return { headers, messageBody: messageBody.trim() }
  } catch (error) {
    console.error('Error parsing raw message:', error)
    return { headers: {}, messageBody: '' }
  }
}

// Simple suspicious keyword detection
function containsSuspiciousKeywords(body: string): boolean {
  const suspiciousKeywords = [
    'urgent', 'immediate action', 'verify account', 'suspended',
    'click here', 'update payment', 'confirm identity', 'tax refund',
    'prize', 'winner', 'congratulations', 'limited time',
  ]
  const lower = body.toLowerCase()
  return suspiciousKeywords.some(k => lower.includes(k))
}

// Main webhook handler
export async function POST(req: Request) {
  try {
    console.log('📧 WorkMail webhook received')
    const requestBody = await req.json()
    const webhook = WorkMailWebhookSchema.parse(requestBody)

    console.log('📧 Processing WorkMail notification:', webhook.notificationType)
    if (webhook.notificationType !== 'Delivery') {
      console.log('ℹ️ Ignoring non-delivery notification')
      return NextResponse.json({ status: 'ignored' })
    }

    const mail = webhook.mail
    const sender = mail.commonHeaders.from[0] || mail.source
    const recipients = mail.commonHeaders.to || mail.destination

    const senderMonitored = await isMonitoredEmployee(sender)
    const recipientsMonitored = await Promise.all(
      recipients.map(email => isMonitoredEmployee(email))
    )
    if (!senderMonitored && !recipientsMonitored.some(Boolean)) {
      console.log('ℹ️ No monitored employees involved, skipping email')
      return NextResponse.json({ status: 'skipped' })
    }

    const { organizationId, region } = await getWorkMailConfig()
    const mailClient = new WorkMailMessageFlowClient({ region })

    const { headers, messageBody } = await parseRawMessage(
      mailClient,
      organizationId,
      mail.messageId
    )

    const urls = extractUrls(messageBody)
    const emailPayload = {
      type: 'raw_email' as const,
      messageId: mail.messageId,
      subject: mail.commonHeaders.subject || 'No Subject',
      sender,
      recipients,
      timestamp: mail.timestamp,
      body: messageBody,
      bodyHtml: messageBody,
      attachments: [],
      headers,
      direction: senderMonitored ? 'outbound' as const : 'inbound' as const,
      size: messageBody.length,
      urls,
    }

    console.log('📧 Forwarding email for processing...')
    const procResp = await fetch(`${BASE_URL}/api/email-processor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload),
    })
    if (!procResp.ok) {
      console.error('❌ Email processor failed:', await procResp.text())
      throw new Error('Email processing failed')
    }

    if (urls.length > 0 || containsSuspiciousKeywords(messageBody)) {
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
            body: messageBody,
            timestamp: mail.timestamp,
            urls,
          }),
        })
      } catch (err) {
        console.error('❌ Threat analysis failed:', err)
      }
    }

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
            body: messageBody,
            timestamp: mail.timestamp,
            urls,
          },
        }),
      })
    } catch (err) {
      console.error('❌ Graph database update failed:', err)
    }

    console.log('✅ Email processed successfully')
    return NextResponse.json({
      status: 'processed',
      messageId: mail.messageId,
      threatsTriggered: urls.length > 0 || containsSuspiciousKeywords(messageBody),
    })
  } catch (error: any) {
    console.error('❌ WorkMail webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed', message: error.message },
      { status: 500 }
    )
  }
}

// GET endpoint for webhook verification (if needed)
export async function GET(req: Request) {
  return NextResponse.json({ status: 'webhook_ready' })
}