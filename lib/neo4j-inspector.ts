// lib/neo4j-inspector.ts

import { getDriver } from './neo4j'
import { Record } from 'neo4j-driver'

export interface DatabaseStats {
  totalNodes: number
  totalRelationships: number
  nodeLabels: { label: string; count: number }[]
  relationshipTypes: { type: string; count: number }[]
  sampleNodes: any[]
}

export async function inspectDatabase(): Promise<DatabaseStats> {
  const session = getDriver().session()
  
  try {
    // Get total nodes and relationships
    const countsResult = await session.run(`
      MATCH (n)
      OPTIONAL MATCH ()-[r]->()
      RETURN count(DISTINCT n) as nodeCount, count(DISTINCT r) as relCount
    `)
    
    const { nodeCount, relCount } = countsResult.records[0].toObject()
    
    // Get node labels with counts
    const labelsResult = await session.run(`
      CALL db.labels() YIELD label
      CALL apoc.cypher.run('MATCH (n:' + label + ') RETURN count(n) as count', {}) YIELD value
      RETURN label, value.count as count
      ORDER BY count DESC
    `)
    
    let nodeLabels: { label: string; count: number }[] = []
    try {
      nodeLabels = labelsResult.records.map((record: Record) => ({
        label: record.get('label'),
        count: record.get('count').toNumber()
      }))
    } catch (error) {
      // Fallback if APOC is not available
      const simpleLabelsResult = await session.run(`
        MATCH (n)
        RETURN DISTINCT labels(n) as labels, count(n) as count
        ORDER BY count DESC
        LIMIT 10
      `)
      
      nodeLabels = simpleLabelsResult.records.map((record: Record) => ({
        label: record.get('labels').join(':'),
        count: record.get('count').toNumber()
      }))
    }
    
    // Get relationship types with counts
    const relTypesResult = await session.run(`
      MATCH ()-[r]->()
      RETURN type(r) as relType, count(r) as count
      ORDER BY count DESC
      LIMIT 10
    `)
    
    const relationshipTypes = relTypesResult.records.map((record: Record) => ({
      type: record.get('relType'),
      count: record.get('count').toNumber()
    }))
    
    // Get sample nodes
    const sampleResult = await session.run(`
      MATCH (n)
      RETURN n
      LIMIT 5
    `)
    
    const sampleNodes = sampleResult.records.map((record: Record) => {
      const node = record.get('n')
      return {
        id: node.identity.toNumber(),
        labels: node.labels,
        properties: node.properties
      }
    })
    
    return {
      totalNodes: nodeCount.toNumber(),
      totalRelationships: relCount.toNumber(),
      nodeLabels,
      relationshipTypes,
      sampleNodes
    }
    
  } finally {
    await session.close()
  }
}

export async function checkEmailData(): Promise<{
  hasEmails: boolean
  emailCount: number
  hasUsers: boolean
  userCount: number
  sampleEmails: any[]
}> {
  const session = getDriver().session()
  
  try {
    // Check for email-related data
    const emailResult = await session.run(`
      MATCH (e:Email)
      RETURN count(e) as emailCount
    `)
    
    const userResult = await session.run(`
      MATCH (u:User)
      RETURN count(u) as userCount
    `)
    
    const sampleEmailsResult = await session.run(`
      MATCH (u:User)-[:WAS_SENT]->(e:Email)
      RETURN u.email as sender, e.subject as subject, e.sentDate as date
      LIMIT 5
    `)
    
    const emailCount = emailResult.records[0].get('emailCount').toNumber()
    const userCount = userResult.records[0].get('userCount').toNumber()
    
    const sampleEmails = sampleEmailsResult.records.map((record: Record) => ({
      sender: record.get('sender'),
      subject: record.get('subject'),
      date: record.get('date')
    }))
    
    return {
      hasEmails: emailCount > 0,
      emailCount,
      hasUsers: userCount > 0,
      userCount,
      sampleEmails
    }
    
  } finally {
    await session.close()
  }
}