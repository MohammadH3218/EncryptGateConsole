// lib/graphrag-copilot.ts

import { Driver } from 'neo4j-driver'
import Graph from 'graphology'
import { CommunityDetector, Community } from './community-detection'

interface Entity {
  name: string
  type: string
  description: string
  emailsMentioned: string[]
}

interface Relationship {
  source: string
  target: string
  type: string
  description: string
  strength: number
}

interface Claim {
  subject: string
  predicate: string
  object: string
  description: string
  sourceEmail: string
  confidence: number
}


interface AgentMemory {
  agentId: string
  sessionStart: Date
  conversationHistory: any[]
  investigationFocus: string[]
  entityKnowledgeGraph: Record<string, any>
  performanceMetrics: Record<string, number>
  queryCache: Record<string, [any, number]>
  communities: Record<string, Community>
  globalKnowledgeGraph: Record<string, any>
}

interface QueryResult {
  response: string
  confidence: number
  error?: string
}

export class GraphRAGEntityExtractor {
  private openaiApiKey: string
  private model: string

  constructor(openaiApiKey: string, model: string = 'gpt-4o-mini') {
    this.openaiApiKey = openaiApiKey
    this.model = model
  }

  async extractFromEmails(emailBatch: any[]): Promise<{
    entities: Entity[]
    relationships: Relationship[]
    claims: Claim[]
  }> {
    const entities: Entity[] = []
    const relationships: Relationship[] = []
    const claims: Claim[] = []

    for (const email of emailBatch) {
      try {
        const result = await this.extractFromSingleEmail(email)
        entities.push(...result.entities)
        relationships.push(...result.relationships)
        claims.push(...result.claims)
      } catch (error) {
        console.warn(`Failed to extract from email ${email.messageId}`)
      }
    }

    return { entities, relationships, claims }
  }

  private async extractFromSingleEmail(email: any): Promise<{
    entities: Entity[]
    relationships: Relationship[]
    claims: Claim[]
  }> {
    const content = `Subject: ${email.subject || ''}\nBody: ${email.body || ''}`
    const sender = email.sender || ''

    const extractionPrompt = `Extract entities, relationships, and claims from this email:

Sender: ${sender}
Content: ${content}

Format:

ENTITIES:
Name|Type|Description

RELATIONSHIPS:
SourceEntity|TargetEntity|RelationType|Description

CLAIMS:
Subject|Predicate|Object|Description

Focus on business relationships, communication patterns, and important decisions.`

    try {
      const response = await this.callOpenAI(extractionPrompt)
      return this.parseExtractionResponse(response, email.messageId)
    } catch (error) {
      return { entities: [], relationships: [], claims: [] }
    }
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 1000,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || ''
  }

  private parseExtractionResponse(response: string, emailId: string): {
    entities: Entity[]
    relationships: Relationship[]
    claims: Claim[]
  } {
    const entities: Entity[] = []
    const relationships: Relationship[] = []
    const claims: Claim[] = []

    let currentSection: string | null = null

    for (const line of response.split('\n')) {
      const trimmedLine = line.trim()
      if (!trimmedLine) continue

      if (trimmedLine.startsWith('ENTITIES:')) {
        currentSection = 'entities'
        continue
      } else if (trimmedLine.startsWith('RELATIONSHIPS:')) {
        currentSection = 'relationships'
        continue
      } else if (trimmedLine.startsWith('CLAIMS:')) {
        currentSection = 'claims'
        continue
      }

      if (!trimmedLine.includes('|')) continue

      const parts = trimmedLine.split('|').map(p => p.trim())

      try {
        if (currentSection === 'entities' && parts.length >= 3) {
          entities.push({
            name: parts[0],
            type: parts[1],
            description: parts[2],
            emailsMentioned: [emailId]
          })
        } else if (currentSection === 'relationships' && parts.length >= 4) {
          relationships.push({
            source: parts[0],
            target: parts[1],
            type: parts[2],
            description: parts[3],
            strength: 1.0
          })
        } else if (currentSection === 'claims' && parts.length >= 4) {
          claims.push({
            subject: parts[0],
            predicate: parts[1],
            object: parts[2],
            description: parts[3],
            sourceEmail: emailId,
            confidence: 1.0
          })
        }
      } catch (error) {
        // Skip malformed lines
      }
    }

    return { entities, relationships, claims }
  }
}

export class GlobalQueryHandler {
  private openaiApiKey: string
  private model: string

  constructor(openaiApiKey: string, model: string = 'gpt-4o-mini') {
    this.openaiApiKey = openaiApiKey
    this.model = model
  }

  isGlobalQuery(query: string): boolean {
    const globalIndicators = [
      'overall', 'main themes', 'general patterns', 'across all', 'entire corpus',
      'what are the', 'identify all', 'find all instances', 'summary of',
      'overall communication', 'organizational structure', 'major themes',
      'recurring patterns', 'common topics', 'main categories'
    ]

    const queryLower = query.toLowerCase()
    return globalIndicators.some(indicator => queryLower.includes(indicator))
  }

  async answerGlobalQuery(
    query: string,
    communitiesByLevel: Record<number, Community[]>,
    preferredLevel: number = 1
  ): Promise<string> {
    if (!(preferredLevel in communitiesByLevel)) {
      preferredLevel = Math.min(...Object.keys(communitiesByLevel).map(Number))
    }

    const communities = communitiesByLevel[preferredLevel] || []

    // Generate community answers
    const communityAnswers = []
    for (const community of communities) {
      if (community.summary) {
        const answer = await this.generateCommunityAnswer(query, community)
        if (answer && answer.trim()) {
          communityAnswers.push({
            communityId: community.id,
            answer: answer,
            relevanceScore: this.scoreRelevance(query, answer)
          })
        }
      }
    }

    // Filter and sort by relevance
    const relevantAnswers = communityAnswers
      .filter(ca => ca.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 10)

    if (relevantAnswers.length === 0) {
      return "No relevant information found to answer this global query."
    }

    return await this.generateGlobalAnswer(query, relevantAnswers)
  }

  private async generateCommunityAnswer(query: string, community: Community): Promise<string> {
    const prompt = `Based on this community summary, answer the user's question. If not relevant, respond with "NOT_RELEVANT".

Community Summary:
${community.summary}

User Question: ${query}

Provide a focused answer based only on this community's information:`

    try {
      const response = await this.callOpenAI(prompt)
      return response.includes("NOT_RELEVANT") ? "" : response
    } catch (error) {
      return ""
    }
  }

  private scoreRelevance(query: string, answer: string): number {
    if (!answer || answer.length < 10) return 0.0

    const queryWords = new Set(query.toLowerCase().match(/\w+/g) || [])
    const answerWords = new Set(answer.toLowerCase().match(/\w+/g) || [])

    if (queryWords.size === 0) return 0.5

    const overlap = [...queryWords].filter(word => answerWords.has(word)).length
    const relevance = (overlap / queryWords.size) * Math.min(1.0, answer.length / 100)

    return relevance
  }

  private async generateGlobalAnswer(query: string, communityAnswers: any[]): Promise<string> {
    let answersText = ""
    for (const ca of communityAnswers) {
      answersText += `\n--- Community ${ca.communityId} ---\n${ca.answer}\n`
    }

    const globalPrompt = `Synthesize information from multiple communities to answer this question about email communications.

Original Question: ${query}

Community Answers:
${answersText}

Provide a comprehensive answer that synthesizes key themes and patterns across all communities.`

    try {
      return await this.callOpenAI(globalPrompt)
    } catch (error) {
      return "Failed to generate comprehensive answer."
    }
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 1000,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || ''
  }
}

export class EnhancedEmailCopilot {
  private driver: Driver
  private openaiApiKey: string
  private model: string
  private entityExtractor: GraphRAGEntityExtractor
  private globalQueryHandler: GlobalQueryHandler
  private communityDetector: CommunityDetector
  private agentMemories: Record<string, AgentMemory> = {}

  constructor(driver: Driver, openaiApiKey: string, model: string = 'gpt-4o-mini') {
    this.driver = driver
    this.openaiApiKey = openaiApiKey
    this.model = model
    this.entityExtractor = new GraphRAGEntityExtractor(openaiApiKey, model)
    this.globalQueryHandler = new GlobalQueryHandler(openaiApiKey, model)
    this.communityDetector = new CommunityDetector()
  }

  private getOrCreateAgentMemory(agentId: string): AgentMemory {
    if (!this.agentMemories[agentId]) {
      this.agentMemories[agentId] = {
        agentId,
        sessionStart: new Date(),
        conversationHistory: [],
        investigationFocus: [],
        entityKnowledgeGraph: {},
        performanceMetrics: {},
        queryCache: {},
        communities: {},
        globalKnowledgeGraph: {}
      }
    }
    return this.agentMemories[agentId]
  }

  async askQuestion(question: string, agentId: string = "default"): Promise<QueryResult> {
    try {
      const memory = this.getOrCreateAgentMemory(agentId)

      // Check if this is a global query
      if (this.globalQueryHandler.isGlobalQuery(question)) {
        return await this.handleGlobalQuestion(question, memory)
      }

      // Handle local queries
      const combinedResponse = await this.generateQueryAndAnalysis(question, memory)
      const cypherQuery = this.extractQueryFromResponse(combinedResponse)

      // Execute query
      const records = await this.executeOptimizedQuery(cypherQuery, agentId)

      if (!records || records.length === 0) {
        return {
          response: "No results found for this query.",
          confidence: 50
        }
      }

      // Format response
      const response = this.formatFinalResponse(combinedResponse, records)

      return {
        response,
        confidence: 85
      }

    } catch (error) {
      return {
        response: "I encountered an error processing your question. Please try rephrasing or ask something different.",
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  private async handleGlobalQuestion(question: string, memory: AgentMemory): Promise<QueryResult> {
    // Check if knowledge graph is built
    if (!memory.globalKnowledgeGraph || Object.keys(memory.globalKnowledgeGraph).length === 0) {
      return {
        response: `To answer global questions about themes and patterns, I need to build a knowledge graph first. This feature analyzes communication patterns across all emails to provide comprehensive insights.

Your question: "${question}"

Global questions include:
- "What are the main themes in all communications?"
- "Identify overall communication patterns" 
- "What are the major business topics discussed?"
- "Show me the organizational structure from emails"`,
        confidence: 30
      }
    }

    try {
      const communitiesByLevel = memory.globalKnowledgeGraph.communities || {}

      if (Object.keys(communitiesByLevel).length === 0) {
        return {
          response: "No community data found in knowledge graph. Please rebuild the knowledge graph.",
          confidence: 20
        }
      }

      const globalAnswer = await this.globalQueryHandler.answerGlobalQuery(
        question,
        communitiesByLevel,
        1
      )

      return {
        response: `**Global Analysis Response**

**Question**: ${question}

**Insights**:
${globalAnswer}

*This analysis is based on communities detected in email content and relationships.*`,
        confidence: 90
      }

    } catch (error) {
      return {
        response: "Failed to process global query. Please try again.",
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  private async generateQueryAndAnalysis(question: string, memory: AgentMemory): Promise<string> {
    try {
      let contextInfo = ""
      if (Object.keys(memory.entityKnowledgeGraph).length > 0) {
        const mentionedEntities = Object.keys(memory.entityKnowledgeGraph).slice(0, 3)
        contextInfo += `Previously investigated: ${mentionedEntities.join(', ')}\n`
      }

      const combinedPrompt = `You are an email investigation expert. Generate a Cypher query and provide analysis framework.

Database Schema:
- Nodes: User (email), Email (subject, body, sentDate, messageId)  
- Relationships: WAS_SENT (User)-[:WAS_SENT]->(Email), WAS_SENT_TO (Email)-[:WAS_SENT_TO]->(User)

Context: ${contextInfo}
Question: "${question}"

Respond in this format:

CYPHER_QUERY:
[Your optimized Cypher query here]

ANALYSIS_TYPE:
[statistical|security|network|temporal|content]

KEY_FOCUS:
[What to look for in the results - 2-3 bullet points]

SECURITY_CONCERNS:
[Potential risks or red flags - 2-3 bullet points]

RECOMMENDATIONS:
[Actionable next steps - 2-3 bullet points]`

      const response = await this.callOpenAI(combinedPrompt)
      return response

    } catch (error) {
      return "Error generating query and analysis"
    }
  }

  private extractQueryFromResponse(llmResponse: string): string {
    try {
      const lines = llmResponse.split('\n')
      const queryLines = []
      let capturing = false

      for (const line of lines) {
        if (line.trim().startsWith('CYPHER_QUERY:')) {
          capturing = true
          continue
        } else if (line.trim().startsWith('ANALYSIS_TYPE:')) {
          capturing = false
          break
        } else if (capturing && line.trim()) {
          queryLines.push(line.trim())
        }
      }

      let query = queryLines.join(' ')
      query = query.replace(/```cypher/g, '').replace(/```/g, '').trim()

      return query || "MATCH (e:Email) RETURN e.subject, e.sentDate LIMIT 10"

    } catch (error) {
      return "MATCH (e:Email) RETURN e.subject, e.sentDate LIMIT 10"
    }
  }

  private async executeOptimizedQuery(query: string, agentId: string): Promise<any[]> {
    const memory = this.getOrCreateAgentMemory(agentId)

    // Check cache first
    const queryHash = query
    if (memory.queryCache[queryHash]) {
      const [cachedResult, cacheTime] = memory.queryCache[queryHash]
      if (Date.now() - cacheTime < 60000) { // 1 minute cache
        return cachedResult
      }
    }

    try {
      const session = this.driver.session()
      const result = await session.run(query)
      await session.close()

      const records = result.records.map(record => record.toObject())

      // Cache result
      memory.queryCache[queryHash] = [records, Date.now()]

      return records

    } catch (error) {
      console.error('Query execution failed:', error)
      return []
    }
  }

  private formatFinalResponse(llmResponse: string, records: any[]): string {
    const sections = this.parseLLMSections(llmResponse)

    let response = `**Investigation Analysis**

**Query Details**: Investigation Query
**Results**: ${records.length} records found

**Generated Query**
${sections.query || 'Query not available'}

**Data Retrieved**`

    // Add sample of actual data
    for (let i = 0; i < Math.min(records.length, 10); i++) {
      const record = records[i]
      const lineParts = []
      for (const [key, value] of Object.entries(record)) {
        if (value !== null) {
          lineParts.push(`**${key}**: ${value}`)
        }
      }
      response += `\n${i + 1}. ${lineParts.join(' | ')}`
    }

    if (records.length > 10) {
      response += `\n... and ${records.length - 10} more records`
    }

    // Add analysis sections
    response += `

**Key Focus Areas**
${sections.focus || 'Standard investigation priorities'}

**Security Concerns**
${sections.security || 'Standard security assessment'}

**Recommendations**
${sections.recommendations || 'Continue investigation as planned'}`

    return response
  }

  private parseLLMSections(llmResponse: string): Record<string, string> {
    const sections: Record<string, string> = {}
    let currentSection: string | null = null
    let currentContent: string[] = []

    for (const line of llmResponse.split('\n')) {
      const trimmedLine = line.trim()
      if (trimmedLine.endsWith(':')) {
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n')
        }
        currentSection = trimmedLine.slice(0, -1).toLowerCase().replace(/_/g, '').replace(/ /g, '')
        currentContent = []
      } else if (trimmedLine && currentSection) {
        currentContent.push(trimmedLine)
      }
    }

    // Add final section
    if (currentSection && currentContent.length > 0) {
      sections[currentSection] = currentContent.join('\n')
    }

    return sections
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 1000,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || ''
  }
}