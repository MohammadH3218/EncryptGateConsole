// lib/copilot.ts
import { ensureNeo4jConnection } from './neo4j'
import { askCopilot, fetchEmailContext } from './neo4j'

interface LLMResponse {
  response: string
  confidence?: number
  error?: string
}

const OPENAI_API_KEY = "REDACTED_OPENAI_API_KEY"
const OPENAI_MODEL = "gpt-4o-mini"
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

const SYSTEM_CYPHER_PROMPT = `You are EncryptGate Copilot, a Neo4j Cypher expert for email security analysis.
Use only these labels and relationship types exactly as listed:
- Labels: User, Email, URL
- Relationships: WAS_SENT, WAS_SENT_TO, CONTAINS_URL

IMPORTANT CONTEXT ABOUT THE SCHEMA:
- WAS_SENT: This relationship is from User -> Email (user sent the email)
- WAS_SENT_TO: This relationship is from Email -> User (email was sent to user)
- CONTAINS_URL: This relationship is from Email -> URL

Generate ONLY the raw Cypher query without any markdown formatting, explanations, or code blocks.
The query should start with MATCH and include a RETURN clause.
Always include LIMIT clause (maximum 50 results) to prevent returning too many records.
NEVER modify messageId format - keep angle brackets intact.

Examples:
Q: Who sent emails to john@company.com?
A: MATCH (sender:User)-[:WAS_SENT]->(e:Email)-[:WAS_SENT_TO]->(recipient:User {email: "john@company.com"}) RETURN sender.email, COUNT(e) AS email_count ORDER BY email_count DESC LIMIT 10

Q: What URLs does this email contain?
A: MATCH (e:Email {messageId: "<messageId>"})-[:CONTAINS_URL]->(u:URL) RETURN u.domain LIMIT 10`

const SYSTEM_SUMMARY_PROMPT = `You are EncryptGate Copilot, a security analyst assistant.
Provide a clear, detailed summary of the query results:
- Explain what the data shows in context of the investigation.
- Highlight any important findings.
- Suggest one concrete follow-up investigation step.
Do NOT output any Cypher in this summary.`

const MAX_RETRY_ATTEMPTS = 3

export class SecurityCopilotService {
  private queryCache = new Map<string, { result: any, timestamp: number }>()
  private isInitialized = false

  constructor() {
    this.initialize()
  }

  private async initialize() {
    try {
      console.log('🔄 Initializing Security Copilot...')
      console.log('🔗 Testing Neo4j connection...')
      
      // Test Neo4j connection with better error reporting
      const neo4j = await ensureNeo4jConnection()
      const result = await neo4j.runQuery('RETURN 1 as test')
      
      console.log('✅ Neo4j connection successful:', result)
      this.isInitialized = true
      console.log('✅ Security Copilot initialized successfully')
    } catch (error: any) {
      console.error('❌ Failed to initialize Security Copilot:', error)
      console.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        name: error.name
      })
      
      // Provide more specific error messages
      if (error.message?.includes('ECONNREFUSED')) {
        throw new Error(`Neo4j connection failed: Cannot connect to Neo4j at bolt://localhost:7687. Please ensure Neo4j is running and accessible.`)
      } else if (error.message?.includes('authentication')) {
        throw new Error(`Neo4j authentication failed: Please check your Neo4j username and password.`)
      } else {
        throw new Error(`Failed to initialize: ${error.message || error}`)
      }
    }
  }

  async addEmail(params: {
    messageId: string;
    sender: string;
    recipients: string[];
    subject: string;
    body: string;
    timestamp: string;
    urls: string[];
  }): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    try {
      const neo4j = await ensureNeo4jConnection()
      
      // Create User nodes for sender and recipients in batches
      const allUsers = [params.sender, ...params.recipients]
      for (const userEmail of allUsers) {
        try {
          await neo4j.runQuery(
            'MERGE (u:User {email: $email}) RETURN u',
            { email: userEmail }
          )
        } catch (error) {
          console.warn(`Failed to create user ${userEmail}:`, error)
        }
      }
      
      // Create Email node
      await neo4j.runQuery(`
        MERGE (e:Email {messageId: $messageId})
        SET e.subject = $subject,
            e.body = $body,
            e.sentDate = $timestamp
        RETURN e
      `, {
        messageId: params.messageId,
        subject: params.subject,
        body: params.body,
        timestamp: params.timestamp
      })
      
      // Create WAS_SENT relationship (sender -> email)
      await neo4j.runQuery(`
        MATCH (u:User {email: $sender}), (e:Email {messageId: $messageId})
        MERGE (u)-[:WAS_SENT]->(e)
      `, {
        sender: params.sender,
        messageId: params.messageId
      })
      
      // Create WAS_SENT_TO relationships (email -> recipients)
      for (const recipient of params.recipients) {
        try {
          await neo4j.runQuery(`
            MATCH (e:Email {messageId: $messageId}), (u:User {email: $recipient})
            MERGE (e)-[:WAS_SENT_TO]->(u)
          `, {
            messageId: params.messageId,
            recipient: recipient
          })
        } catch (error) {
          console.warn(`Failed to create WAS_SENT_TO relationship for ${recipient}:`, error)
        }
      }
      
      // Create URL nodes and relationships
      for (const url of params.urls) {
        try {
          const domain = new URL(url).hostname
          
          await neo4j.runQuery(`
            MERGE (u:URL {url: $url})
            SET u.domain = $domain
            RETURN u
          `, { url, domain })
          
          await neo4j.runQuery(`
            MATCH (e:Email {messageId: $messageId}), (u:URL {url: $url})
            MERGE (e)-[:CONTAINS_URL]->(u)
          `, {
            messageId: params.messageId,
            url: url
          })
        } catch (error) {
          console.warn(`Failed to process URL ${url}:`, error)
        }
      }
      
      console.log(`✅ Email added to Neo4j graph: ${params.messageId}`)
      
    } catch (error) {
      console.error('❌ Failed to add email to Neo4j graph:', error)
      throw new Error(`Failed to add email to graph: ${error}`)
    }
  }

  async queryLLM(system: string, user: string, temperature: number = 0.2): Promise<string> {
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for LLM queries')
    }

    try {
      const response = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature,
          max_tokens: 1000,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`LLM API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content
      
      if (!content) {
        throw new Error('No content received from LLM')
      }
      
      return content
    } catch (error) {
      console.error('LLM query error:', error)
      throw new Error(`Failed to query LLM: ${error}`)
    }
  }

  extractCypherQuery(text: string): string {
    // Remove code blocks
    let query = text.replace(/```(?:cypher)?\s*\n([\s\S]*?)\n```/g, '$1')
    
    // Look for MATCH...RETURN pattern
    const queryPattern = /(?:^|\n)(MATCH[\s\S]+?RETURN[\s\S]+?)(?:$|\n\n)/i
    const matches = query.match(queryPattern)
    if (matches) {
      query = matches[1]
    }
    
    // Clean up
    query = query.replace(/```\s*(?:python|cypher)?\s*$/g, '').trim()
    
    // Ensure LIMIT clause
    if (!query.toUpperCase().includes('LIMIT')) {
      if (query.toUpperCase().includes('ORDER BY')) {
        query = query.replace(/(ORDER BY[^;]+?)$/i, '$1 LIMIT 50')
      } else if (query.toUpperCase().includes('RETURN')) {
        query += ' LIMIT 50'
      }
    }
    
    return query.trim()
  }

  async generateCypher(question: string, context?: any): Promise<string> {
    const contextInfo = context ? `
Context:
- Email: ${context.subject || 'N/A'}
- Sender: ${context.sender || 'N/A'}
- Recipients: ${context.recipients?.join(', ') || 'N/A'}
- Message ID: ${context.messageId || 'N/A'}
` : ''

    const prompt = `${contextInfo}
Question: "${question}"
Generate only the Cypher query. No explanations, markdown, or code blocks.
The query must start with MATCH and include a RETURN clause.
Always include a LIMIT clause (maximum 50 results).`

    const response = await this.queryLLM(SYSTEM_CYPHER_PROMPT, prompt)
    return this.extractCypherQuery(response)
  }

  async correctCypher(query: string, error: string, attempt: number): Promise<string> {
    const correctionPrompt = `Fix this Neo4j Cypher query that returned this error: "${error}"

Original query:
${query}

This is correction attempt #${attempt}. The query must work with our schema:
- Nodes: User, Email, URL  
- Relationships: WAS_SENT, WAS_SENT_TO, CONTAINS_URL

CRITICAL REQUIREMENTS:
1. NEVER modify the messageId format - keep angle brackets intact
2. Break down complex patterns into simpler steps with WITH clauses
3. Always define variables before using them
4. ALWAYS include LIMIT in your query to prevent too many results (max 50)

RETURN ONLY THE FIXED QUERY - NO EXPLANATIONS, NO MARKDOWN, NO BACKTICKS.`

    const temperature = Math.min(0.2 + (attempt * 0.1), 0.8)
    const response = await this.queryLLM(SYSTEM_CYPHER_PROMPT, correctionPrompt, temperature)
    return this.extractCypherQuery(response)
  }

  async executeCypherWithRetry(question: string, context?: any): Promise<{ results: any[], query: string }> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const neo4j = await ensureNeo4jConnection()
    let query = await this.generateCypher(question, context)
    let lastError = ''

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        console.log(`🔍 Executing query (attempt ${attempt}):`, query)
        const records = await neo4j.runQuery(query)
        
        return { results: records, query }
      } catch (error: any) {
        lastError = error.message
        console.error(`❌ Query attempt ${attempt} failed:`, lastError)
        
        if (attempt < MAX_RETRY_ATTEMPTS) {
          query = await this.correctCypher(query, lastError, attempt)
        }
      }
    }

    throw new Error(`Failed to execute query after ${MAX_RETRY_ATTEMPTS} attempts. Last error: ${lastError}`)
  }

  async summarizeResults(question: string, query: string, results: any[]): Promise<string> {
    if (!results || results.length === 0) {
      return "No results found for this query."
    }

    // Limit results for summarization
    const limitedResults = results.slice(0, 20)
    
    const summaryPrompt = `The user asked: "${question}"

Cypher query used:
${query}

Results:
${JSON.stringify(limitedResults, null, 2)}

Provide a clear analysis of these results in context of the email investigation.`

    try {
      return await this.queryLLM(SYSTEM_SUMMARY_PROMPT, summaryPrompt)
    } catch (error) {
      console.error('Summarization error:', error)
      return `Query returned ${results.length} results. Unable to generate detailed summary due to: ${error}`
    }
  }

  async processQuestion(question: string, context?: any): Promise<LLMResponse> {
    try {
      // Check cache first
      const cacheKey = `${question}-${JSON.stringify(context)}`
      const cached = this.queryCache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < 60000) { // 1 minute cache
        return {
          response: cached.result,
          confidence: 90,
        }
      }

      // Check if Neo4j is available
      if (!this.isInitialized) {
        try {
          await this.initialize()
        } catch (error) {
          console.warn('Neo4j not available, providing fallback response:', error)
          return this.provideFallbackResponse(question, context)
        }
      }

      // Handle messageId-specific queries
      const messageId = context?.messageId || (typeof context === 'string' ? context : null)
      if (messageId) {
        try {
          const response = await askCopilot(question, messageId)
          const result = {
            response: response,
            confidence: 90,
          }
          this.queryCache.set(cacheKey, { result: response, timestamp: Date.now() })
          return result
        } catch (error) {
          console.warn('Neo4j-based query failed, falling back to LLM-only response:', error)
          return this.provideFallbackResponse(question, context)
        }
      }
      
      // Fallback to graph query
      try {
        const { results, query } = await this.executeCypherWithRetry(question, context)
        const summary = await this.summarizeResults(question, query, results)
        
        const result = {
          response: summary,
          confidence: 85,
        }
        
        this.queryCache.set(cacheKey, { result: summary, timestamp: Date.now() })
        return result
      } catch (error) {
        console.warn('Graph query failed, falling back to LLM-only response:', error)
        return this.provideFallbackResponse(question, context)
      }
      
    } catch (error: any) {
      console.error('Question processing failed:', error)
      return {
        response: `I encountered an error processing your question: ${error.message}. Please try rephrasing your question or ask something different.`,
        error: error.message,
        confidence: 0,
      }
    }
  }

  private async provideFallbackResponse(question: string, context?: any): Promise<LLMResponse> {
    try {
      console.log('🔄 Providing fallback response without Neo4j...')
      
      let contextInfo = ''
      if (context?.subject) {
        contextInfo = `
Email Context:
- Subject: ${context.subject}
- Sender: ${context.sender || 'Unknown'}
- Recipients: ${context.recipients?.join(', ') || 'Unknown'}
- Date: ${context.date || 'Unknown'}
`
      }

      const fallbackPrompt = `You are EncryptGate Copilot, a security analyst assistant. 
${contextInfo}
The user asked: "${question}"

Since the email database is not currently accessible, provide general security guidance and analysis based on the available context. Focus on:
- General email security best practices
- Common threat patterns
- Recommended investigation steps
- Security recommendations

Be helpful while noting that detailed database queries are not available.`

      const response = await this.queryLLM(
        'You are a helpful security analyst assistant.',
        fallbackPrompt,
        0.3
      )

      return {
        response: `⚠️ Database connection unavailable. Here's general guidance:\n\n${response}`,
        confidence: 60,
        error: 'Neo4j database not accessible'
      }
    } catch (error: any) {
      return {
        response: `I'm currently unable to process your question due to system issues. Please ensure Neo4j is running and try again later.`,
        error: error.message,
        confidence: 0,
      }
    }
  }

  async getEmailContext(messageId: string): Promise<any> {
    try {
      console.log('🔍 Fetching email context for:', messageId)
      const contextString = await fetchEmailContext(messageId)
      
      if (!contextString) {
        console.log('❌ No context found for messageId:', messageId)
        return null
      }
      
      // Parse the context string to extract structured data
      const lines = contextString.split('\n')
      const context: any = { messageId }
      
      for (const line of lines) {
        if (line.includes('From:')) {
          context.sender = line.split('From:')[1]?.trim()
        } else if (line.includes('To:')) {
          const recipients = line.split('To:')[1]?.trim()
          context.recipients = recipients ? recipients.split(',').map(r => r.trim()) : []
        } else if (line.includes('Subject:')) {
          context.subject = line.split('Subject:')[1]?.trim()
        } else if (line.includes('Date:')) {
          context.date = line.split('Date:')[1]?.trim()
        } else if (line.includes('Snippet:')) {
          context.snippet = line.split('Snippet:')[1]?.trim()
        }
      }
      
      console.log('✅ Email context loaded:', context)
      return context
    } catch (error) {
      console.error('❌ Error fetching email context:', error)
      return null
    }
  }

  // Health check method
  async isHealthy(): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        await this.initialize()
      }
      const neo4j = await ensureNeo4jConnection()
      await neo4j.runQuery('RETURN 1')
      return true
    } catch (error) {
      console.error('Health check failed:', error)
      return false
    }
  }
}

// Singleton instance
let copilotService: SecurityCopilotService | null = null

export function getCopilotService(): SecurityCopilotService {
  if (!copilotService) {
    copilotService = new SecurityCopilotService()
  }
  return copilotService
}

// Export enhanced version for graph operations
export { SecurityCopilotService as EnhancedSecurityCopilot }