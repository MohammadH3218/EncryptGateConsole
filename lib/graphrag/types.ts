// lib/graphrag/types.ts

export interface Entity {
  name: string
  type: string
  description: string
  emailsMentioned: string[]
}

export interface Relationship {
  source: string
  target: string
  type: string
  description: string
  strength: number
}

export interface Claim {
  subject: string
  predicate: string
  object: string
  description: string
  sourceEmail: string
  confidence: number
}

export interface Community {
  id: string
  level: number
  entities: Set<string>
  relationships: Relationship[]
  summary: string
  parentCommunity?: string
  subCommunities: string[]
}

export interface ExtractionResult {
  entities: Entity[]
  relationships: Relationship[]
  claims: Claim[]
}

export interface CommunityGraph {
  [level: number]: Community[]
}

export interface GlobalQueryContext {
  entities: Entity[]
  relationships: Relationship[]
  claims: Claim[]
  communities: CommunityGraph
}

export interface QueryContext {
  messageId?: string
  sender?: string
  recipients?: string[]
  subject?: string
  date?: string
  snippet?: string
}