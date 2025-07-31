// lib/neo4j.ts
import neo4j, { Driver, Session, Record } from 'neo4j-driver'

export interface Neo4jConfig {
  uri: string
  username: string
  password: string
}

export class Neo4jService {
  private driver: Driver | null = null

  constructor(private config: Neo4jConfig) {}

  async connect(): Promise<void> {
    try {
      this.driver = neo4j.driver(
        this.config.uri,
        neo4j.auth.basic(this.config.username, this.config.password)
      )
      await this.driver.verifyConnectivity()
      console.log('✅ Connected to Neo4j')
    } catch (error) {
      console.error('❌ Failed to connect to Neo4j:', error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (this.driver) {
      await this.driver.close()
      this.driver = null
      console.log('✅ Disconnected from Neo4j')
    }
  }

  private getSession(): Session {
    if (!this.driver) {
      throw new Error('Neo4j driver not connected')
    }
    return this.driver.session()
  }

  async runQuery(query: string, parameters: Record<string, any> = {}): Promise<Record[]> {
    const session = this.getSession()
    try {
      const result = await session.run(query, parameters)
      return result.records
    } finally {
      await session.close()
    }
  }

  async addEmail(emailData: {
    messageId: string
    sender: string
    recipients: string[]
    subject: string
    body: string
    timestamp: string
    urls?: string[]
  }): Promise<void> {
    const session = this.getSession()
    try {
      // Create email node
      await session.run(
        `
        MERGE (e:Email {messageId: $messageId})
        SET e.subject = $subject,
            e.body = $body,
            e.sentDate = $timestamp
        `,
        {
          messageId: emailData.messageId,
          subject: emailData.subject,
          body: emailData.body,
          timestamp: emailData.timestamp,
        }
      )

      // Create sender user and relationship
      await session.run(
        `
        MERGE (u:User {email: $sender})
        MERGE (e:Email {messageId: $messageId})
        MERGE (u)-[:WAS_SENT]->(e)
        `,
        {
          sender: emailData.sender,
          messageId: emailData.messageId,
        }
      )

      // Create recipient users and relationships
      for (const recipient of emailData.recipients) {
        await session.run(
          `
          MERGE (u:User {email: $recipient})
          MERGE (e:Email {messageId: $messageId})
          MERGE (e)-[:WAS_SENT_TO]->(u)
          `,
          {
            recipient,
            messageId: emailData.messageId,
          }
        )
      }

      // Create URL nodes and relationships
      if (emailData.urls && emailData.urls.length > 0) {
        for (const url of emailData.urls) {
          const domain = this.extractDomain(url)
          await session.run(
            `
            MERGE (url:URL {domain: $domain})
            MERGE (e:Email {messageId: $messageId})
            MERGE (e)-[:CONTAINS_URL {url: $url}]->(url)
            `,
            {
              domain,
              url,
              messageId: emailData.messageId,
            }
          )
        }
      }
    } finally {
      await session.close()
    }
  }

  async getEmailContext(messageId: string): Promise<any> {
    const session = this.getSession()
    try {
      const result = await session.run(
        `
        MATCH (u:User)-[:WAS_SENT]->(e:Email {messageId: $messageId})
        OPTIONAL MATCH (e)-[:WAS_SENT_TO]->(r:User)
        RETURN u.email AS sender, 
               collect(r.email) AS recipients,
               e.sentDate AS date, 
               e.subject AS subject, 
               e.body AS body
        `,
        { messageId }
      )

      if (result.records.length === 0) {
        return null
      }

      const record = result.records[0]
      return {
        messageId,
        sender: record.get('sender'),
        recipients: record.get('recipients').filter((r: string) => r),
        date: record.get('date'),
        subject: record.get('subject'),
        body: record.get('body'),
      }
    } finally {
      await session.close()
    }
  }

  async queryEmails(query: string, limit: number = 50): Promise<Record[]> {
    // Add LIMIT to query if not present
    const finalQuery = query.toUpperCase().includes('LIMIT') 
      ? query 
      : `${query} LIMIT ${limit}`
    
    return this.runQuery(finalQuery)
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `http://${url}`)
      return urlObj.hostname
    } catch {
      return url
    }
  }

  // Utility method to check connection
  async isConnected(): Promise<boolean> {
    try {
      if (!this.driver) return false
      await this.driver.verifyConnectivity()
      return true
    } catch {
      return false
    }
  }
}

// Singleton instance
let neo4jService: Neo4jService | null = null

export function getNeo4jService(): Neo4jService {
  if (!neo4jService) {
    const config: Neo4jConfig = {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USER || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password',
    }
    neo4jService = new Neo4jService(config)
  }
  return neo4jService
}

export async function ensureNeo4jConnection(): Promise<Neo4jService> {
  const service = getNeo4jService()
  if (!(await service.isConnected())) {
    await service.connect()
  }
  return service
}