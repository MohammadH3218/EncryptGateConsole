// lib/community-detection.ts

import Graph from 'graphology'

interface Relationship {
  source: string
  target: string
  type: string
  description: string
  strength: number
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

export class CommunityDetector {
  detectCommunities(entities: any[], relationships: any[]): Record<number, Community[]> {
    // Build graph
    const graph = new Graph({ type: 'undirected' })
    
    // Add nodes
    for (const entity of entities) {
      if (!graph.hasNode(entity.name)) {
        graph.addNode(entity.name, {
          type: entity.type,
          description: entity.description
        })
      }
    }
    
    // Add edges
    for (const rel of relationships) {
      if (graph.hasNode(rel.source) && graph.hasNode(rel.target)) {
        if (!graph.hasEdge(rel.source, rel.target)) {
          graph.addEdge(rel.source, rel.target, {
            type: rel.type,
            description: rel.description,
            weight: rel.strength || 1.0
          })
        }
      }
    }
    
    const communities: Record<number, Community[]> = {}
    
    // Level 0: Use simple connected components as communities
    const components = this.findConnectedComponents(graph)
    communities[0] = components.map((component, index) => ({
      id: `community_0_${index}`,
      level: 0,
      entities: new Set(component),
      relationships: relationships.filter(rel => 
        component.includes(rel.source) && component.includes(rel.target)
      ),
      summary: '',
      subCommunities: []
    }))
    
    // Level 1: Subdivide large communities
    communities[1] = []
    for (let i = 0; i < communities[0].length; i++) {
      const community = communities[0][i]
      if (community.entities.size > 5) {
        // Create subgraph and find more components
        const subgraph = graph.copy()
        const nodesToKeep = Array.from(community.entities)
        
        graph.forEachNode(node => {
          if (!nodesToKeep.includes(node)) {
            if (subgraph.hasNode(node)) {
              subgraph.dropNode(node)
            }
          }
        })
        
        const subComponents = this.findConnectedComponents(subgraph)
        for (let j = 0; j < subComponents.length; j++) {
          const subCommunity: Community = {
            id: `community_1_${i}_${j}`,
            level: 1,
            entities: new Set(subComponents[j]),
            relationships: relationships.filter(rel => 
              subComponents[j].includes(rel.source) && subComponents[j].includes(rel.target)
            ),
            summary: '',
            parentCommunity: community.id,
            subCommunities: []
          }
          communities[1].push(subCommunity)
          community.subCommunities.push(subCommunity.id)
        }
      } else {
        // Keep small communities as-is
        const smallCommunity: Community = {
          id: `community_1_${i}_0`,
          level: 1,
          entities: community.entities,
          relationships: community.relationships,
          summary: '',
          parentCommunity: community.id,
          subCommunities: []
        }
        communities[1].push(smallCommunity)
        community.subCommunities.push(smallCommunity.id)
      }
    }
    
    return communities
  }
  
  private findConnectedComponents(graph: Graph): string[][] {
    const visited = new Set<string>()
    const components: string[][] = []
    
    graph.forEachNode(node => {
      if (!visited.has(node)) {
        const component = this.dfs(graph, node, visited)
        if (component.length > 0) {
          components.push(component)
        }
      }
    })
    
    return components
  }
  
  private dfs(graph: Graph, start: string, visited: Set<string>): string[] {
    const component: string[] = []
    const stack = [start]
    
    while (stack.length > 0) {
      const node = stack.pop()!
      if (!visited.has(node)) {
        visited.add(node)
        component.push(node)
        
        graph.forEachNeighbor(node, neighbor => {
          if (!visited.has(neighbor)) {
            stack.push(neighbor)
          }
        })
      }
    }
    
    return component
  }
}