export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import {
  QueryCommand,
  ScanCommand,
  PutItemCommand,
  GetItemCommand
} from '@aws-sdk/client-dynamodb'
import { ddb } from '@/lib/aws'
import { z } from 'zod'
import { getDriver } from '@/lib/neo4j'
import neo4j from 'neo4j-driver'

const ORG_ID          = process.env.ORGANIZATION_ID      || 'default-org' // Fallback only for local dev
const CS_TABLE        = process.env.CLOUDSERVICES_TABLE  || 'CloudServices'
const EMPLOYEES_TABLE = process.env.EMPLOYEES_TABLE_NAME || 'Employees'
const EMAILS_TABLE    = process.env.EMAILS_TABLE_NAME    || 'Emails'
const BASE_URL        = process.env.BASE_URL             || 'https://console-encryptgate.net'
const AWS_REGION      = process.env.AWS_REGION           || 'us-east-1'

console.log('📧 Enhanced Webhook Handler initialized:', {
  ORG_ID,
  CS_TABLE,
  EMPLOYEES_TABLE,
  EMAILS_TABLE,
  BASE_URL,
  AWS_REGION
})

// Helper function to look up orgId from CloudServices table
async function lookupOrgIdFromWorkMail(workmailOrgId: string): Promise<string | null> {
  try {
    console.log('🔍 Looking up orgId for WorkMail organization:', workmailOrgId)
    const csResp = await ddb.send(new ScanCommand({
      TableName: CS_TABLE,
      FilterExpression: 'organizationId = :orgId AND serviceType = :serviceType',
      ExpressionAttributeValues: {
        ':orgId': { S: workmailOrgId },
        ':serviceType': { S: 'aws-workmail' }
      },
      Limit: 1
    }))

    if (csResp.Items && csResp.Items.length > 0) {
      const foundOrgId = csResp.Items[0].orgId?.S
      if (foundOrgId) {
        console.log('✅ Found orgId from CloudServices:', foundOrgId)
        return foundOrgId
      }
    }
    console.warn(`⚠️ No CloudServices entry found for WorkMail org ${workmailOrgId}`)
    return null
  } catch (err) {
    console.error('❌ Error looking up orgId from CloudServices:', err)
    return null
  }
}

// Enhanced schemas for different processing methods
const S3ProcessedEmailSchema = z.object({
  messageId: z.string(),
  subject: z.string(),
  flowDirection: z.enum(['INBOUND', 'OUTBOUND']).optional(),
  orgId: z.string().optional(),
  organizationId: z.string().optional(), // WorkMail organization ID for lookup
  envelope: z.object({
    mailFrom: z.string(),
    recipients: z.array(z.string()),
    organizationId: z.string().optional() // Also might be in envelope
  }),
  timestamp: z.string(),
  raw: z.object({
    base64: z.string()
  }),
  extractedBody: z.string(),
  processingInfo: z.object({
    version: z.string(),
    extractionMethod: z.string(),
    requestId: z.string(),
    headersExtracted: z.number().optional(),
    bodyExtracted: z.boolean().optional(),
    bodyLength: z.number().optional(),
    contentType: z.string().optional(),
    s3: z.object({
      bucket: z.string(),
      key: z.string(),
      size: z.number().optional()
    }).optional()
  })
});

const WorkMailMessageFlowSchema = z.object({
  messageId: z.string(),
  flowDirection: z.enum(['INBOUND', 'OUTBOUND']).optional(),
  orgId: z.string().optional(),
  summaryVersion: z.string().optional(),
  envelope: z.object({
    mailFrom: z.string().optional(),
    recipients: z.array(z.string()).optional()
  }).optional(),
  subject: z.string().optional(),
  timestamp: z.string().optional(),
  raw: z.object({
    base64: z.string()
  }).optional(),
  extractedBody: z.string().optional(),
  processingInfo: z.object({
    version: z.string(),
    extractionMethod: z.string(),
    requestId: z.string()
  }).optional()
})

async function isMonitoredEmployee(email: string, orgId: string): Promise<boolean> {
  try {
    console.log(`🔍 Checking if ${email} is monitored in org ${orgId}...`)

    const resp = await ddb.send(new GetItemCommand({
      TableName: EMPLOYEES_TABLE,
      Key: {
        orgId: { S: orgId },
        email: { S: email }
      }
    }))

    const isMonitored = Boolean(resp.Item)
    console.log(`${isMonitored ? '✅' : '❌'} ${email} is ${isMonitored ? '' : 'not '}monitored`)

    return isMonitored
  } catch (err) {
    console.error('❌ Error checking monitored employee:', err)
    return false
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
    'prize', 'winner', 'limited time',
    'act now', 'final notice'
  ]
  const lower = body.toLowerCase()
  const found = suspicious.filter(k => lower.includes(k))
  if (found.length > 0) {
    console.log(`⚠️ Found suspicious keywords: ${found.join(', ')}`)
  }
  return found.length > 0
}

async function storeEmailInDynamoDB(emailData: any, userId: string): Promise<void> {
  try {
    console.log(`💾 Storing email in DynamoDB for user: ${userId}`)
    
    const emailId = `email-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
    
    const dbItem: Record<string, any> = {
      userId: { S: userId },
      receivedAt: { S: emailData.timestamp },
      messageId: { S: emailData.messageId },
      emailId: { S: emailId },
      sender: { S: emailData.sender || '' },
      subject: { S: emailData.subject || 'No Subject' },
      body: { S: emailData.body || '' },
      bodyHtml: { S: emailData.bodyHtml || emailData.body || '' },
      direction: { S: emailData.direction || 'inbound' },
      size: { N: String(emailData.size || emailData.body?.length || 0) },
      status: { S: 'received' },
      threatLevel: { S: 'none' },
      isPhishing: { BOOL: false },
      createdAt: { S: new Date().toISOString() },
      flaggedCategory: { S: 'clean' }, // Set initial state to 'clean' (will be updated after analysis)
      updatedAt: { S: new Date().toISOString() }
    }

    // Add optional fields
    if (emailData.recipients?.length) dbItem.recipients = { SS: emailData.recipients }
    if (emailData.attachments?.length) dbItem.attachments = { SS: emailData.attachments }
    if (emailData.urls?.length) dbItem.urls = { SS: emailData.urls }
    if (emailData.headers && Object.keys(emailData.headers).length) {
      dbItem.headers = { S: JSON.stringify(emailData.headers) }
    }

    await ddb.send(new PutItemCommand({
      TableName: EMAILS_TABLE,
      Item: dbItem,
      // TEMPORARILY DISABLE DUPLICATE CHECK FOR DEBUGGING
      // ConditionExpression: 'attribute_not_exists(messageId)'
    }))
    
    console.log('✅ Email stored successfully in DynamoDB')
    
  } catch(err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      console.log('ℹ️ Email already exists, skipping duplicate:', emailData.messageId)
      return
    } else {
      console.error('❌ DynamoDB storage failed:', err)
      throw err
    }
  }
}

export async function POST(req: Request) {
  try {
    console.log('📥 Enhanced webhook received')
    const raw = await req.json()
    
    console.log('🔍 Raw webhook data analysis:', {
      hasMessageId: !!raw?.messageId,
      hasFlowDirection: !!raw?.flowDirection,
      hasRaw: !!raw?.raw?.base64,
      hasExtractedBody: !!raw?.extractedBody,
      processingVersion: raw?.processingInfo?.version,
      extractionMethod: raw?.processingInfo?.extractionMethod,
      hasS3Info: !!raw?.processingInfo?.s3,
      bodyLength: raw?.extractedBody?.length || 0,
      hasRealContent: raw?.extractedBody && raw.extractedBody.length > 10,
      contentPreview: raw?.extractedBody ? raw.extractedBody.substring(0, 100) + '...' : 'NO CONTENT'
    })

    // REJECT any SES records that somehow make it here
    if (raw?.Records?.[0]?.eventSource === 'aws:ses') {
      console.log('🚫 REJECTED: Direct SES events not supported in webhook')
      return NextResponse.json({
        status: 'rejected',
        reason: 'direct_ses_events_not_supported',
        message: 'Use Lambda->Webhook flow, not direct SES->Webhook'
      }, { status: 400 })
    }

    // PRIORITY: Handle S3-processed emails (primary path)
    if (raw?.processingInfo?.extractionMethod?.includes('S3') || raw?.processingInfo?.s3) {
      console.log('📧 Processing S3-extracted email (PRIMARY PATH)')
      
      try {
        const event = S3ProcessedEmailSchema.parse(raw)
        
        const emailData = {
          messageId: event.messageId,
          subject: event.subject,
          sender: event.envelope.mailFrom,
          recipients: event.envelope.recipients,
          body: event.extractedBody || 'No content available',
          timestamp: event.timestamp,
          headers: {}, // Could parse from raw.base64 if needed
          direction: 'inbound',
          size: event.processingInfo.bodyLength || event.extractedBody?.length || 0,
          urls: extractUrls(event.extractedBody || ''),
          attachments: []
        }
        
        console.log('📧 S3-processed email data:', {
          messageId: emailData.messageId,
          subject: emailData.subject,
          sender: emailData.sender,
          recipients: emailData.recipients.length,
          bodyLength: emailData.body?.length || 0,
          bodyPreview: emailData.body?.substring(0, 150) || 'NO BODY',
          hasRealContent: emailData.body && emailData.body.length > 10 && !emailData.body.includes('No email content available'),
          extractionMethod: event.processingInfo.extractionMethod,
          s3Bucket: event.processingInfo.s3?.bucket,
          s3Key: event.processingInfo.s3?.key
        })

        // Extract orgId by looking up WorkMail organization in CloudServices
        console.log('🔍 Event payload check:', {
          hasOrganizationId: !!event.organizationId,
          hasEnvelopeOrgId: !!event.envelope?.organizationId,
          organizationIdValue: event.organizationId,
          envelopeOrgIdValue: event.envelope?.organizationId,
          eventKeys: Object.keys(event)
        })

        let orgId = ORG_ID // Start with fallback
        const workmailOrgId = event.organizationId || event.envelope?.organizationId

        if (workmailOrgId) {
          const lookedUpOrgId = await lookupOrgIdFromWorkMail(workmailOrgId)
          if (lookedUpOrgId) {
            orgId = lookedUpOrgId
          } else {
            console.log('⚠️ Could not find orgId for WorkMail org, using fallback:', ORG_ID)
          }
        } else {
          console.log('⚠️ No WorkMail organizationId in event, using fallback:', ORG_ID)
        }

        console.log('🏢 Using organization ID:', orgId)

        // Check monitoring status
        const senderMonitored = await isMonitoredEmployee(emailData.sender, orgId)
        const recipientsMonitored = await Promise.all(
          emailData.recipients.map(email => isMonitoredEmployee(email, orgId))
        )

        const hasMonitoredParticipant = senderMonitored || recipientsMonitored.some(Boolean)
        
        // TEMPORARILY DISABLE MONITORING CHECK FOR DEBUGGING
        if (!hasMonitoredParticipant) {
          console.log('⚠️ No monitored participants found, but processing anyway for debugging:', {
            sender: emailData.sender,
            recipients: emailData.recipients,
            senderMonitored,
            recipientsMonitored
          })
          // Continue processing instead of skipping
        }
        
        // Determine userId
        const userId = senderMonitored 
          ? emailData.sender 
          : emailData.recipients[recipientsMonitored.findIndex(Boolean)] || emailData.recipients[0]
        
        console.log('👤 Using userId for storage:', userId)
        
        // Store email first
        await storeEmailInDynamoDB(emailData, userId)
        
        // ALWAYS trigger threat detection for ALL emails (not just suspicious ones)
        // This ensures DistilBERT, VirusTotal, and Neo4j analysis runs for every email
        // IMPORTANT: Wait for threat detection to complete so email is properly flagged
        try {
          console.log('🔍 Triggering threat detection for email:', emailData.messageId, 'orgId:', orgId, 'bodyLength:', emailData.body?.length || 0)
          const threatResponse = await fetch(`${BASE_URL}/api/threat-detection`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-org-id': orgId, // Pass orgId from event or fallback
            },
            body: JSON.stringify({
              messageId: emailData.messageId,
              sender: emailData.sender,
              recipients: emailData.recipients,
              subject: emailData.subject || 'No Subject',
              body: emailData.body || '',
              timestamp: emailData.timestamp,
              urls: emailData.urls || [],
              direction: emailData.direction || 'inbound',
              attachments: [] // Attachments would need to be fetched from S3 if available
            }),
            // Wait for response - increased timeout to ensure completion
            signal: AbortSignal.timeout(120000) // 120 second timeout (2 minutes) for multi-agent system
          })
          
          if (threatResponse.ok) {
            const threatData = await threatResponse.json()
            const analysis = threatData.analysis || threatData
            console.log('✅ Threat detection completed:', {
              messageId: emailData.messageId,
              threatLevel: analysis.threatLevel,
              threatScore: analysis.threatScore,
              flaggedCategory: analysis.flaggedCategory || (analysis.threatLevel === 'medium' || analysis.threatLevel === 'high' || analysis.threatLevel === 'critical' ? 'ai' : 'clean'),
              isPhishing: analysis.isPhishing,
              isMalware: analysis.isMalware
            })
          } else {
            const errorText = await threatResponse.text().catch(() => 'Unknown error')
            console.error(`❌ Threat detection returned status ${threatResponse.status}:`, errorText)
          }
        } catch (threatErr: any) {
          console.error('❌ Threat detection call failed:', {
            message: threatErr.message,
            name: threatErr.name,
            messageId: emailData.messageId
          })
          // Don't fail the whole request - email is still stored, but log the error for debugging
        }

        // Add email to Neo4j graph directly
        try {
          console.log('📊 Adding email to Neo4j graph...')
          const driver = await getDriver()
          const session = driver.session()
          
          const neo4jQuery = `
            // Create or merge sender
            MERGE (sender:User {email: $senderEmail})
            ON CREATE SET sender.createdAt = datetime()
            
            // Create email node (use MERGE to avoid duplicates)
            MERGE (e:Email {messageId: $messageId})
            ON CREATE SET 
              e.subject = $subject,
              e.body = $body,
              e.sentDate = $sentDate,
              e.direction = $direction,
              e.size = $size
            ON MATCH SET
              e.subject = $subject,
              e.body = $body,
              e.sentDate = $sentDate,
              e.direction = $direction,
              e.size = $size
            
            // Create relationship: sender sent email
            MERGE (sender)-[:WAS_SENT]->(e)
            
            // Create or merge recipients and relationships
            WITH e
            UNWIND $recipients AS recipientEmail
            MERGE (recipient:User {email: recipientEmail})
            ON CREATE SET recipient.createdAt = datetime()
            MERGE (e)-[:WAS_SENT_TO]->(recipient)
            
            // Handle URLs if present
            WITH e
            UNWIND CASE WHEN $urls IS NOT NULL AND size($urls) > 0 THEN $urls ELSE [] END AS urlString
            MERGE (url:URL {url: urlString})
            ON CREATE SET url.createdAt = datetime()
            MERGE (e)-[:CONTAINS_URL]->(url)
            
            RETURN e.messageId as messageId
          `
          
          const result = await session.run(neo4jQuery, {
            messageId: emailData.messageId,
            senderEmail: emailData.sender,
            subject: emailData.subject || 'No Subject',
            body: emailData.body || '',
            sentDate: emailData.timestamp,
            direction: emailData.direction || 'inbound',
            size: emailData.size || 0,
            recipients: emailData.recipients || [],
            urls: emailData.urls || []
          })
          
          await session.close()
          console.log('✅ Email successfully added to Neo4j graph:', emailData.messageId)
        } catch (graphErr: any) {
          console.error('❌ Failed to add email to Neo4j graph:', graphErr.message)
          // Don't fail the whole request if Neo4j fails - email is still in DynamoDB
        }

        console.log('🎉 S3-processed email handling complete')
        return NextResponse.json({
          status: 'processed',
          messageId: emailData.messageId,
          processingMethod: 'S3_ENHANCED_EXTRACTION',
          bodyLength: emailData.body.length,
          hasRealContent: emailData.body.length > 10 && !emailData.body.includes('No email content available'),
          userId: userId,
          threatsDetected: false, // Threat detection runs asynchronously, will be updated later
          extractionMethod: event.processingInfo.extractionMethod
        })
        
      } catch (parseError: any) {
        console.error('❌ S3 email parsing failed:', parseError.message)
        return NextResponse.json({
          error: 'S3 email parsing failed',
          details: parseError.message,
          extractionMethod: raw?.processingInfo?.extractionMethod
        }, { status: 400 })
      }
    }

    // FALLBACK: Handle WorkMail Message Flow events
    if (raw?.processingInfo?.extractionMethod?.includes('WORKMAIL') || 
        (raw?.messageId && raw?.envelope && !raw?.processingInfo?.s3)) {
      console.log('📧 Processing WorkMail Message Flow event (FALLBACK)')
      
      try {
        const event = WorkMailMessageFlowSchema.parse(raw)
        
        // Skip outbound messages
        if (event.flowDirection === 'OUTBOUND') {
          console.log('🚫 Skipping OUTBOUND message')
          return NextResponse.json({
            status: 'skipped',
            reason: 'outbound_message',
            messageId: event.messageId
          })
        }
        
        // Process WorkMail event (similar to S3 but with WorkMail-specific handling)
        const emailData = {
          messageId: event.messageId,
          subject: event.subject || 'No Subject',
          sender: event.envelope?.mailFrom || 'unknown@email.com',
          recipients: event.envelope?.recipients || ['unknown@email.com'],
          body: event.extractedBody || 'No content available from WorkMail',
          timestamp: event.timestamp || new Date().toISOString(),
          headers: {},
          direction: 'inbound',
          size: event.extractedBody?.length || 0,
          urls: extractUrls(event.extractedBody || ''),
          attachments: []
        }
        
        console.log('📧 WorkMail email data:', {
          messageId: emailData.messageId,
          bodyLength: emailData.body.length,
          hasContent: emailData.body.length > 10
        })

        // Extract orgId by looking up WorkMail organization in CloudServices
        let orgId = ORG_ID // Start with fallback
        const workmailOrgId = event.organizationId

        if (workmailOrgId) {
          const lookedUpOrgId = await lookupOrgIdFromWorkMail(workmailOrgId)
          if (lookedUpOrgId) {
            orgId = lookedUpOrgId
          } else {
            console.log('⚠️ Could not find orgId for WorkMail org, using fallback:', ORG_ID)
          }
        } else {
          console.log('⚠️ No WorkMail organizationId in event, using fallback:', ORG_ID)
        }

        console.log('🏢 Using organization ID:', orgId)

        // Apply same monitoring and storage logic as S3 path
        const senderMonitored = await isMonitoredEmployee(emailData.sender, orgId)
        const recipientsMonitored = await Promise.all(
          emailData.recipients.map(email => isMonitoredEmployee(email, orgId))
        )

        const hasMonitoredParticipant = senderMonitored || recipientsMonitored.some(Boolean)
        
        // TEMPORARILY DISABLE MONITORING CHECK FOR DEBUGGING  
        if (!hasMonitoredParticipant) {
          console.log('⚠️ No monitored participants in WorkMail event, but processing anyway for debugging')
          // Continue processing instead of skipping
        }
        
        const userId = senderMonitored 
          ? emailData.sender 
          : emailData.recipients[recipientsMonitored.findIndex(Boolean)] || emailData.recipients[0]
        
        await storeEmailInDynamoDB(emailData, userId)
        
        // Add email to Neo4j graph directly
        try {
          console.log('📊 Adding WorkMail email to Neo4j graph...')
          const driver = await getDriver()
          const session = driver.session()
          
          const neo4jQuery = `
            // Create or merge sender
            MERGE (sender:User {email: $senderEmail})
            ON CREATE SET sender.createdAt = datetime()
            
            // Create email node (use MERGE to avoid duplicates)
            MERGE (e:Email {messageId: $messageId})
            ON CREATE SET 
              e.subject = $subject,
              e.body = $body,
              e.sentDate = $sentDate,
              e.direction = $direction,
              e.size = $size
            ON MATCH SET
              e.subject = $subject,
              e.body = $body,
              e.sentDate = $sentDate,
              e.direction = $direction,
              e.size = $size
            
            // Create relationship: sender sent email
            MERGE (sender)-[:WAS_SENT]->(e)
            
            // Create or merge recipients and relationships
            WITH e
            UNWIND $recipients AS recipientEmail
            MERGE (recipient:User {email: recipientEmail})
            ON CREATE SET recipient.createdAt = datetime()
            MERGE (e)-[:WAS_SENT_TO]->(recipient)
            
            // Handle URLs if present
            WITH e
            UNWIND CASE WHEN $urls IS NOT NULL AND size($urls) > 0 THEN $urls ELSE [] END AS urlString
            MERGE (url:URL {url: urlString})
            ON CREATE SET url.createdAt = datetime()
            MERGE (e)-[:CONTAINS_URL]->(url)
            
            RETURN e.messageId as messageId
          `
          
          const result = await session.run(neo4jQuery, {
            messageId: emailData.messageId,
            senderEmail: emailData.sender,
            subject: emailData.subject || 'No Subject',
            body: emailData.body || '',
            sentDate: emailData.timestamp,
            direction: emailData.direction || 'inbound',
            size: emailData.size || 0,
            recipients: emailData.recipients || [],
            urls: emailData.urls || []
          })
          
          await session.close()
          console.log('✅ WorkMail email successfully added to Neo4j graph:', emailData.messageId)
        } catch (graphErr: any) {
          console.error('❌ Failed to add WorkMail email to Neo4j graph:', graphErr.message)
          // Don't fail the whole request if Neo4j fails - email is still in DynamoDB
        }
        
        console.log('✅ WorkMail email processed')
        return NextResponse.json({
          status: 'processed',
          messageId: emailData.messageId,
          processingMethod: 'WORKMAIL_MESSAGE_FLOW',
          bodyLength: emailData.body.length
        })
        
      } catch (parseError: any) {
        console.error('❌ WorkMail parsing failed:', parseError.message)
        return NextResponse.json({
          error: 'WorkMail event parsing failed',
          details: parseError.message
        }, { status: 400 })
      }
    }

    // Unknown format
    console.error('❌ Unknown webhook format:', {
      hasMessageId: !!raw?.messageId,
      hasProcessingInfo: !!raw?.processingInfo,
      extractionMethod: raw?.processingInfo?.extractionMethod,
      topLevelKeys: Object.keys(raw || {})
    })
    
    return NextResponse.json({
      error: 'Unknown webhook event format',
      supportedFormats: ['S3_ENHANCED', 'WORKMAIL_MESSAGE_FLOW'],
      receivedFormat: {
        extractionMethod: raw?.processingInfo?.extractionMethod || 'unknown',
        hasS3Info: !!raw?.processingInfo?.s3,
        hasMessageId: !!raw?.messageId
      }
    }, { status: 400 })

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
  console.log('🏥 Health check - Enhanced Email Webhook')
  try {
    await ddb.send(new QueryCommand({
      TableName: CS_TABLE,
      KeyConditionExpression: 'orgId = :orgId',
      ExpressionAttributeValues: { ':orgId': { S: ORG_ID } },
      Limit: 1
    }))
    
    return NextResponse.json({ 
      status: 'webhook_ready',
      version: 'enhanced-v2.0',
      supportedMethods: [
        'SES_S3_ENHANCED',
        'WORKMAIL_MESSAGE_FLOW', 
        'SES_LIMITED_FALLBACK'
      ],
      primaryPath: 'SES->S3->Lambda->Webhook',
      features: [
        'full-email-body-extraction',
        'enhanced-mime-parsing',
        'real-content-validation',
        'threat-detection-integration',
        'monitored-employee-filtering'
      ]
    })
  } catch(err) {
    console.error('❌ Health check failed', err)
    return NextResponse.json({ status: 'unhealthy', error: err }, { status: 500 })
  }
}