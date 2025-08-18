// lib/graphrag/entity-extractor.ts

import { Entity, Relationship, Claim, ExtractionResult } from './types'

interface EmailData {
  messageId: string
  subject?: string
  body?: string
  sender?: string
}

export class GraphRAGEntityExtractor {
  private openaiApiKey: string
  private model: string

  constructor(openaiApiKey: string, model: string = 'gpt-4o-mini') {
    this.openaiApiKey = openaiApiKey
    this.model = model
  }

  async extractFromEmails(emailBatch: EmailData[]): Promise<ExtractionResult> {
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
        console.warn(`Failed to extract from email ${email.messageId}:`, error)
      }
    }

    return { entities, relationships, claims }
  }

  private async extractFromSingleEmail(email: EmailData): Promise<ExtractionResult> {
    const content = `Subject: ${email.subject || ''}\nBody: ${email.body || ''}`
    const sender = email.sender || ''

    const extractionPrompt = `
You are an expert at extracting structured information from email communications for investigation purposes.

Extract entities, relationships, and claims from this email:

Sender: ${sender}
Content: ${content}

Extract in this format:

ENTITIES:
[List entities like people, organizations, projects, topics, locations, etc.]
Format: Name|Type|Description

RELATIONSHIPS:
[List relationships between entities, including email communication patterns]
Format: SourceEntity|TargetEntity|RelationType|Description

CLAIMS:
[List important statements, facts, or assertions made in the email]
Format: Subject|Predicate|Object|Description

Focus on:
- People and organizations mentioned
- Business relationships and hierarchies
- Projects, partnerships, deals
- Important decisions or statements
- Communication patterns
- Geographic locations
- Financial or business entities
`

    try {
      const response = await this.callOpenAI(extractionPrompt)
      return this.parseExtractionResponse(response, email.messageId)
    } catch (error) {
      console.error('Entity extraction failed:', error)
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
        messages: [
          { role: 'user', content: prompt }
        ],
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

  private parseExtractionResponse(response: string, emailId: string): ExtractionResult {
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
        console.warn(`Failed to parse line: ${trimmedLine}`)
      }
    }

    return { entities, relationships, claims }
  }
}