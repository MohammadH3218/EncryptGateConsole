// lib/graphrag-packs.ts - Pre-computed subgraph knowledge packs for faster investigations
import { getDriver } from './neo4j'

/**
 * Subgraph pack - pre-computed investigation context
 */
export interface SubgraphPack {
  packId: string
  emailId: string
  type: 'sender-network' | 'recipient-network' | 'url-network' | 'campaign' | 'full-context'
  nodes: any[]
  relationships: any[]
  metadata: {
    generatedAt: string
    ttl: number  // Time to live in seconds
    cypherQuery: string
  }
}

/**
 * Generate sender network subgraph pack
 * Includes: sender, all emails sent, recipients, URLs
 */
export async function generateSenderNetworkPack(emailId: string): Promise<SubgraphPack> {
  const driver = await getDriver()
  const session = driver.session()

  const query = `
    MATCH (email:Email {messageId: $emailId})<-[:WAS_SENT]-(sender:User)
    MATCH (sender)-[:WAS_SENT]->(senderEmails:Email)
    OPTIONAL MATCH (senderEmails)-[:WAS_SENT_TO]->(recipients:User)
    OPTIONAL MATCH (senderEmails)-[:CONTAINS_URL]->(urls:URL)

    WITH sender, collect(DISTINCT senderEmails) AS emails,
         collect(DISTINCT recipients) AS recipients,
         collect(DISTINCT urls) AS urls

    RETURN {
      sender: sender,
      emails: emails,
      recipients: recipients,
      urls: urls,
      emailCount: size(emails),
      recipientCount: size(recipients),
      urlCount: size(urls)
    } AS pack
  `

  const result = await session.run(query, { emailId })
  await session.close()

  if (result.records.length === 0) {
    throw new Error('Email not found')
  }

  const pack = result.records[0].get('pack')

  return {
    packId: `sender-network-${emailId}`,
    emailId,
    type: 'sender-network',
    nodes: [
      pack.sender,
      ...pack.emails,
      ...pack.recipients,
      ...pack.urls
    ],
    relationships: [],
    metadata: {
      generatedAt: new Date().toISOString(),
      ttl: 3600, // 1 hour
      cypherQuery: query
    }
  }
}

/**
 * Generate recipient network subgraph pack
 * Includes: all recipients, their other emails, shared senders
 */
export async function generateRecipientNetworkPack(emailId: string): Promise<SubgraphPack> {
  const driver = await getDriver()
  const session = driver.session()

  const query = `
    MATCH (email:Email {messageId: $emailId})-[:WAS_SENT_TO]->(recipient:User)
    MATCH (recipient)<-[:WAS_SENT_TO]-(otherEmails:Email)
    OPTIONAL MATCH (otherEmails)<-[:WAS_SENT]-(senders:User)

    WITH collect(DISTINCT recipient) AS recipients,
         collect(DISTINCT otherEmails) AS emails,
         collect(DISTINCT senders) AS senders

    RETURN {
      recipients: recipients,
      emails: emails,
      senders: senders
    } AS pack
  `

  const result = await session.run(query, { emailId })
  await session.close()

  if (result.records.length === 0) {
    throw new Error('Email not found')
  }

  const pack = result.records[0].get('pack')

  return {
    packId: `recipient-network-${emailId}`,
    emailId,
    type: 'recipient-network',
    nodes: [
      ...pack.recipients,
      ...pack.emails,
      ...pack.senders
    ],
    relationships: [],
    metadata: {
      generatedAt: new Date().toISOString(),
      ttl: 3600,
      cypherQuery: query
    }
  }
}

/**
 * Generate campaign subgraph pack
 * Includes: similar emails (same subject/timeframe), all participants
 */
export async function generateCampaignPack(emailId: string): Promise<SubgraphPack> {
  const driver = await getDriver()
  const session = driver.session()

  const query = `
    MATCH (email:Email {messageId: $emailId})
    MATCH (similarEmail:Email)
    WHERE similarEmail.subject = email.subject
      AND abs(duration.inSeconds(similarEmail.sentDate, email.sentDate).seconds) < 86400

    MATCH (similarEmail)<-[:WAS_SENT]-(senders:User)
    MATCH (similarEmail)-[:WAS_SENT_TO]->(recipients:User)
    OPTIONAL MATCH (similarEmail)-[:CONTAINS_URL]->(urls:URL)

    WITH collect(DISTINCT similarEmail) AS emails,
         collect(DISTINCT senders) AS senders,
         collect(DISTINCT recipients) AS recipients,
         collect(DISTINCT urls) AS urls

    RETURN {
      emails: emails,
      senders: senders,
      recipients: recipients,
      urls: urls,
      campaignSize: size(emails)
    } AS pack
  `

  const result = await session.run(query, { emailId })
  await session.close()

  if (result.records.length === 0) {
    throw new Error('Email not found')
  }

  const pack = result.records[0].get('pack')

  return {
    packId: `campaign-${emailId}`,
    emailId,
    type: 'campaign',
    nodes: [
      ...pack.emails,
      ...pack.senders,
      ...pack.recipients,
      ...pack.urls
    ],
    relationships: [],
    metadata: {
      generatedAt: new Date().toISOString(),
      ttl: 7200, // 2 hours (campaigns change slowly)
      cypherQuery: query
    }
  }
}

/**
 * Generate full context pack (comprehensive)
 * Includes: email, sender network, recipient network, campaign
 */
export async function generateFullContextPack(emailId: string): Promise<SubgraphPack> {
  const [senderPack, recipientPack, campaignPack] = await Promise.all([
    generateSenderNetworkPack(emailId),
    generateRecipientNetworkPack(emailId),
    generateCampaignPack(emailId)
  ])

  // Merge all packs
  const allNodes = [
    ...senderPack.nodes,
    ...recipientPack.nodes,
    ...campaignPack.nodes
  ]

  // Deduplicate nodes
  const uniqueNodes = Array.from(
    new Map(allNodes.map(node => [JSON.stringify(node), node])).values()
  )

  return {
    packId: `full-context-${emailId}`,
    emailId,
    type: 'full-context',
    nodes: uniqueNodes,
    relationships: [],
    metadata: {
      generatedAt: new Date().toISOString(),
      ttl: 1800, // 30 minutes
      cypherQuery: 'Merged from sender, recipient, and campaign packs'
    }
  }
}

/**
 * Cache for subgraph packs (in-memory)
 */
const packCache = new Map<string, { pack: SubgraphPack; expiresAt: number }>()

/**
 * Get or generate subgraph pack with caching
 */
export async function getSubgraphPack(
  emailId: string,
  type: SubgraphPack['type']
): Promise<SubgraphPack> {
  const cacheKey = `${type}-${emailId}`

  // Check cache
  const cached = packCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    console.log(`📦 Using cached subgraph pack: ${cacheKey}`)
    return cached.pack
  }

  // Generate pack
  console.log(`🔨 Generating subgraph pack: ${cacheKey}`)
  let pack: SubgraphPack

  switch (type) {
    case 'sender-network':
      pack = await generateSenderNetworkPack(emailId)
      break
    case 'recipient-network':
      pack = await generateRecipientNetworkPack(emailId)
      break
    case 'campaign':
      pack = await generateCampaignPack(emailId)
      break
    case 'full-context':
      pack = await generateFullContextPack(emailId)
      break
    default:
      throw new Error(`Unknown pack type: ${type}`)
  }

  // Cache pack
  const expiresAt = Date.now() + (pack.metadata.ttl * 1000)
  packCache.set(cacheKey, { pack, expiresAt })

  return pack
}

/**
 * Convert subgraph pack to natural language summary for LLM
 */
export function packToNaturalLanguage(pack: SubgraphPack): string {
  const summary: string[] = []

  summary.push(`# ${pack.type.replace('-', ' ').toUpperCase()} Context`)
  summary.push(`Generated: ${new Date(pack.metadata.generatedAt).toLocaleString()}`)
  summary.push('')

  // Count node types
  const nodeTypes = new Map<string, number>()
  pack.nodes.forEach(node => {
    const type = node.labels?.[0] || 'Unknown'
    nodeTypes.set(type, (nodeTypes.get(type) || 0) + 1)
  })

  summary.push('## Network Summary')
  nodeTypes.forEach((count, type) => {
    summary.push(`- ${count} ${type} nodes`)
  })
  summary.push('')

  // Add specific insights based on pack type
  if (pack.type === 'sender-network') {
    summary.push('## Sender Network')
    summary.push('This shows all emails sent by the sender, recipients, and URLs.')
  } else if (pack.type === 'recipient-network') {
    summary.push('## Recipient Network')
    summary.push('This shows who else these recipients communicate with.')
  } else if (pack.type === 'campaign') {
    summary.push('## Email Campaign')
    summary.push('This shows similar emails sent around the same time.')
  }

  return summary.join('\n')
}

/**
 * Clear pack cache
 */
export function clearPackCache(emailId?: string) {
  if (emailId) {
    const keysToDelete: string[] = []
    packCache.forEach((_, key) => {
      if (key.includes(emailId)) {
        keysToDelete.push(key)
      }
    })
    keysToDelete.forEach(key => packCache.delete(key))
    console.log(`🗑️ Cleared ${keysToDelete.length} cached packs for ${emailId}`)
  } else {
    packCache.clear()
    console.log('🗑️ Cleared all cached subgraph packs')
  }
}
