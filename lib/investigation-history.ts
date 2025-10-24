// lib/investigation-history.ts - Auto-save investigation conversations
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { v4 as uuidv4 } from 'uuid'

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' })
const docClient = DynamoDBDocumentClient.from(client)

const TABLE_NAME = process.env.INVESTIGATION_HISTORY_TABLE || 'InvestigationHistory'

/**
 * Investigation session stored in DynamoDB
 */
export interface InvestigationSession {
  sessionId: string                  // PK: Unique session ID
  emailId: string                     // GSI: Email message ID
  createdAt: string                   // ISO timestamp
  updatedAt: string                   // ISO timestamp
  userId?: string                     // User who ran investigation
  messages: SessionMessage[]          // Chat history
  pipeline?: string                   // Pipeline used (if any)
  status: 'active' | 'completed'      // Session status
  tokensUsed: number                  // Total tokens consumed
  duration: number                    // Total duration in ms
  metadata?: {
    emailSubject?: string
    emailSender?: string
    priority?: string
  }
}

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  thinking?: {
    steps: any[]
    toolCalls: any[]
    toolResults: any[]
  }
  tokensUsed?: number
  duration?: number
}

/**
 * Create a new investigation session
 */
export async function createInvestigationSession(
  emailId: string,
  userId?: string,
  metadata?: any
): Promise<string> {
  const sessionId = uuidv4()
  const now = new Date().toISOString()

  const session: InvestigationSession = {
    sessionId,
    emailId,
    createdAt: now,
    updatedAt: now,
    userId,
    messages: [],
    status: 'active',
    tokensUsed: 0,
    duration: 0,
    metadata
  }

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: session
  }))

  console.log(`✅ Created investigation session: ${sessionId} for email: ${emailId}`)
  return sessionId
}

/**
 * Add a message to an investigation session (auto-save)
 */
export async function addMessageToSession(
  sessionId: string,
  message: SessionMessage
): Promise<void> {
  const now = new Date().toISOString()

  try {
    // Get current session
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { sessionId }
    }))

    if (!result.Item) {
      console.error(`Session not found: ${sessionId}`)
      return
    }

    const session = result.Item as InvestigationSession
    const messages = [...(session.messages || []), message]

    // Calculate totals
    const tokensUsed = session.tokensUsed + (message.tokensUsed || 0)
    const duration = session.duration + (message.duration || 0)

    // Update session
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { sessionId },
      UpdateExpression: 'SET messages = :messages, updatedAt = :updatedAt, tokensUsed = :tokensUsed, duration = :duration',
      ExpressionAttributeValues: {
        ':messages': messages,
        ':updatedAt': now,
        ':tokensUsed': tokensUsed,
        ':duration': duration
      }
    }))

    console.log(`✅ Added message to session ${sessionId} (${messages.length} total messages)`)
  } catch (error) {
    console.error(`Failed to add message to session ${sessionId}:`, error)
    throw error
  }
}

/**
 * Complete an investigation session
 */
export async function completeSession(sessionId: string): Promise<void> {
  const now = new Date().toISOString()

  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { sessionId },
    UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': 'completed',
      ':updatedAt': now
    }
  }))

  console.log(`✅ Completed investigation session: ${sessionId}`)
}

/**
 * Get all sessions for an email (ordered by most recent)
 */
export async function getSessionsByEmail(emailId: string): Promise<InvestigationSession[]> {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'EmailIdIndex', // GSI on emailId
      KeyConditionExpression: 'emailId = :emailId',
      ExpressionAttributeValues: {
        ':emailId': emailId
      },
      ScanIndexForward: false // Most recent first
    }))

    return (result.Items || []) as InvestigationSession[]
  } catch (error) {
    console.error(`Failed to get sessions for email ${emailId}:`, error)
    return []
  }
}

/**
 * Get a specific session
 */
export async function getSession(sessionId: string): Promise<InvestigationSession | null> {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { sessionId }
    }))

    return result.Item as InvestigationSession || null
  } catch (error) {
    console.error(`Failed to get session ${sessionId}:`, error)
    return null
  }
}

/**
 * Get latest session for an email
 */
export async function getLatestSession(emailId: string): Promise<InvestigationSession | null> {
  const sessions = await getSessionsByEmail(emailId)
  return sessions.length > 0 ? sessions[0] : null
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { sessionId },
    UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': 'deleted',
      ':updatedAt': new Date().toISOString()
    }
  }))

  console.log(`🗑️ Deleted investigation session: ${sessionId}`)
}

/**
 * Update session metadata
 */
export async function updateSessionMetadata(
  sessionId: string,
  metadata: any
): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { sessionId },
    UpdateExpression: 'SET metadata = :metadata, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':metadata': metadata,
      ':updatedAt': new Date().toISOString()
    }
  }))
}

/**
 * Get session statistics
 */
export async function getSessionStats(sessionId: string): Promise<{
  totalMessages: number
  totalTokens: number
  totalDuration: number
  toolCallsCount: number
}> {
  const session = await getSession(sessionId)

  if (!session) {
    return {
      totalMessages: 0,
      totalTokens: 0,
      totalDuration: 0,
      toolCallsCount: 0
    }
  }

  const toolCallsCount = session.messages.reduce((sum, msg) => {
    return sum + (msg.thinking?.toolCalls?.length || 0)
  }, 0)

  return {
    totalMessages: session.messages.length,
    totalTokens: session.tokensUsed,
    totalDuration: session.duration,
    toolCallsCount
  }
}
