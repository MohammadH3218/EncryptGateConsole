// lib/copilot.ts
import { ensureNeo4jConnection } from './neo4j'

interface LLMResponse {
  response: string
  confidence?: number
  error?: string
}

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'mistralai/mixtral-8x7b-instruct'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

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
  constructor() {}

  async queryLLM(system: string, user: string, temperature: number = 0.2): Promise<string> {
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature,
        }),
      })

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`)
      }

      const data = await response.json()
      return data.choices[0]?.message?.content || ''
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
    const neo4j = await ensureNeo4jConnection()
    let query = await this.generateCypher(question, context)
    let lastError = ''

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        console.log(`🔍 Executing query (attempt ${attempt}):`, query)
        const records = await neo4j.runQuery(query)
        
        const results = records.map(record => {
          const obj: any = {}
          record.keys.forEach(key => {
            obj[key] = record.get(key)
          })
          return obj
        })

        return { results, query }
      } catch (error: any) {
        lastError = error.message
        console.error(`❌ Query attempt ${attempt} failed:`, lastError)
        
        if (attempt < MAX_RETRY_ATTEMPTS) {
          query = await this.correctCypher(query, lastError, attempt + 1)
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
      return `Query returned ${results.length} results. Unable to generate detailed summary.`
    }
  }

  async processQuestion(question: string, context?: any): Promise<LLMResponse> {
    try {
      console.log('🤖 Processing copilot question:', question)
      
      // Execute query with retries
      const { results, query } = await this.executeCypherWithRetry(question, context)
      
      // Summarize results
      const summary = await this.summarizeResults(question, query, results)
      
      return {
        response: summary,
        confidence: 85,
      }
    } catch (error: any) {
      console.error('❌ Copilot processing error:', error)
      
      return {
        response: `I encountered an error processing your question: ${error.message}. Please try rephrasing your question or ask something different.`,
        error: error.message,
      }
    }
  }

  async getEmailContext(messageId: string): Promise<any> {
    try {
      const neo4j = await ensureNeo4jConnection()
      return await neo4j.getEmailContext(messageId)
    } catch (error) {
      console.error('Error fetching email context:', error)
      return null
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