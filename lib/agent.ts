// lib/agent.ts - Multi-step investigation agent with OpenAI tool calling
import { getOpenAIApiKey } from './config'
import { getDriver } from './neo4j'
import neo4j from 'neo4j-driver'

// === Types ===
export interface ToolResult {
  tool: string
  args: any
  output: any
  timestamp: number
}

export interface AgentResult {
  answer: string
  trace: ToolResult[]
  tokensUsed?: number
}

interface OpenAIToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
  name?: string
}

// === Tool Definitions for OpenAI ===
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'inspect_schema',
      description: 'Return Neo4j graph schema including labels, relationships, and properties. Use this first to understand the data model.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_cypher',
      description: 'Execute a READ-ONLY parameterized Cypher query against the Neo4j database. Always use parameters for values, always include LIMIT for large result sets.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The Cypher query to execute (read-only)'
          },
          params: {
            type: 'object',
            description: 'Parameters for the query as key-value pairs'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default 200, max 500)'
          }
        },
        required: ['query'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_gds',
      description: 'Run a Neo4j Graph Data Science algorithm to analyze patterns, find anomalies, or compute centrality metrics. Use for advanced graph analytics.',
      parameters: {
        type: 'object',
        properties: {
          algo: {
            type: 'string',
            description: 'GDS algorithm name (e.g., "pageRank.stream", "louvain.stream", "nodeSimilarity.stream")'
          },
          graphProjection: {
            type: 'object',
            description: 'Graph projection configuration with nodeQuery and relationshipQuery'
          },
          params: {
            type: 'object',
            description: 'Algorithm-specific parameters'
          }
        },
        required: ['algo'],
        additionalProperties: false
      }
    }
  }
] as const

// === Tool Implementations ===

/**
 * Inspect Neo4j schema using apoc.meta.schema
 */
export async function inspectSchema(): Promise<any> {
  try {
    const driver = await getDriver()
    const session = driver.session({ defaultAccessMode: neo4j.session.READ })

    try {
      // Try APOC first
      const result = await session.run('CALL apoc.meta.schema() YIELD value RETURN value')
      if (result.records.length > 0) {
        return result.records[0].get('value')
      }
    } catch (apocError: any) {
      // APOC not available, use basic schema inspection
      console.warn('APOC not available, using basic schema inspection')

      // Get labels
      const labelsResult = await session.run('CALL db.labels() YIELD label RETURN collect(label) as labels')
      const labels = labelsResult.records[0]?.get('labels') || []

      // Get relationship types
      const relsResult = await session.run('CALL db.relationshipTypes() YIELD relationshipType RETURN collect(relationshipType) as types')
      const relationships = relsResult.records[0]?.get('types') || []

      // Get property keys
      const propsResult = await session.run('CALL db.propertyKeys() YIELD propertyKey RETURN collect(propertyKey) as keys')
      const properties = propsResult.records[0]?.get('keys') || []

      return {
        labels,
        relationships,
        properties,
        note: 'Basic schema (APOC not available for detailed metadata)'
      }
    } finally {
      await session.close()
    }
  } catch (error: any) {
    return {
      error: `Schema inspection failed: ${error.message}`,
      fallback: {
        labels: ['User', 'Email', 'URL'],
        relationships: ['WAS_SENT', 'WAS_SENT_TO', 'CONTAINS_URL'],
        note: 'Using known schema as fallback'
      }
    }
  }
}

/**
 * Run a read-only Cypher query with safety checks
 */
export async function runCypher(
  query: string,
  params: any = {},
  limit?: number
): Promise<any> {
  // Safety: Block write operations
  const writePatterns = /\b(create|merge|set|delete|remove|detach|call\s+db\.(createLabel|createRelationshipType))/i
  if (writePatterns.test(query)) {
    return {
      error: 'Write/management statements are not allowed. Only READ queries permitted.',
      query_attempted: query
    }
  }

  // Safety: Ensure LIMIT is present for queries without aggregation
  const hasAggregation = /\b(count|sum|avg|min|max|collect)\s*\(/i.test(query)
  const hasLimit = /\bLIMIT\s+\d+/i.test(query)

  if (!hasAggregation && !hasLimit) {
    const effectiveLimit = Math.min(limit || 200, 500)
    query = query.trim()
    if (query.endsWith(';')) {
      query = query.slice(0, -1)
    }
    query += `\nLIMIT ${effectiveLimit}`
  }

  try {
    const driver = await getDriver()
    const session = driver.session({ defaultAccessMode: neo4j.session.READ })

    try {
      const maxLimit = limit ? Math.min(limit, 500) : 200
      const finalParams = { ...params, __limit: maxLimit }

      const result = await session.run(query, finalParams)
      const records = result.records.map(r => r.toObject())

      return {
        success: true,
        rowCount: records.length,
        data: records,
        query: query,
        params: params
      }
    } finally {
      await session.close()
    }
  } catch (error: any) {
    return {
      error: error.message,
      code: error.code,
      query: query,
      params: params
    }
  }
}

/**
 * Run a GDS algorithm
 */
export async function runGDS(
  algo: string,
  graphProjection?: any,
  params: any = {}
): Promise<any> {
  try {
    const driver = await getDriver()
    const session = driver.session({ defaultAccessMode: neo4j.session.READ })

    try {
      let query: string
      let queryParams: any = {}

      if (graphProjection) {
        // Create anonymous projection and run algorithm
        const projName = `temp_${Date.now()}`
        const { nodeQuery, relationshipQuery } = graphProjection

        query = `
          CALL gds.graph.project.cypher(
            $projName,
            $nodeQuery,
            $relationshipQuery
          )
          YIELD graphName, nodeCount, relationshipCount

          CALL gds.${algo}(graphName, $params)
          YIELD nodeId, score

          WITH gds.util.asNode(nodeId) AS node, score
          CALL gds.graph.drop($projName)

          RETURN node.email AS id, node.messageId AS messageId, score
          ORDER BY score DESC
          LIMIT 200
        `

        queryParams = {
          projName,
          nodeQuery: nodeQuery || 'MATCH (n) RETURN id(n) AS id',
          relationshipQuery: relationshipQuery || 'MATCH (a)-[r]->(b) RETURN id(a) AS source, id(b) AS target',
          params: params || {}
        }
      } else {
        // Run on existing named graph (if it exists)
        query = `
          CALL gds.${algo}($graphName, $params)
          YIELD nodeId, score
          RETURN gds.util.asNode(nodeId) AS node, score
          ORDER BY score DESC
          LIMIT 200
        `

        queryParams = {
          graphName: params.graphName || 'email-graph',
          params: params || {}
        }
      }

      const result = await session.run(query, queryParams)
      const records = result.records.map(r => r.toObject())

      return {
        success: true,
        algorithm: algo,
        rowCount: records.length,
        data: records
      }
    } finally {
      await session.close()
    }
  } catch (error: any) {
    return {
      error: error.message,
      algorithm: algo,
      note: 'GDS may not be installed or graph projection failed. Try inspect_schema or run_cypher instead.'
    }
  }
}

// === Agent Loop ===

/**
 * Main agent loop with OpenAI tool calling
 */
export async function agentLoop(
  initialMessages: OpenAIMessage[],
  maxHops: number = 8
): Promise<AgentResult> {
  const trace: ToolResult[] = []
  const messages: OpenAIMessage[] = [...initialMessages]

  try {
    const apiKey = await getOpenAIApiKey()
    if (!apiKey) {
      throw new Error('OpenAI API key not available')
    }

    for (let hop = 0; hop < maxHops; hop++) {
      console.log(`🔄 Agent hop ${hop + 1}/${maxHops}`)

      // Call OpenAI with tool definitions
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', // Can be upgraded to gpt-4o for better reasoning
          messages: messages,
          tools: TOOLS,
          tool_choice: 'auto',
          temperature: 0.2,
          max_tokens: 2000
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI API error: ${response.status} ${errorText}`)
      }

      const data = await response.json()
      const message = data.choices?.[0]?.message

      if (!message) {
        throw new Error('No message in OpenAI response')
      }

      // Add assistant message to history
      messages.push(message)

      // Check if model wants to use tools
      if (!message.tool_calls || message.tool_calls.length === 0) {
        // No more tools to call - we have the final answer
        return {
          answer: message.content || 'No response generated.',
          trace,
          tokensUsed: data.usage?.total_tokens
        }
      }

      // Execute each tool call
      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function.name
        const toolArgs = JSON.parse(toolCall.function.arguments || '{}')

        console.log(`🔧 Executing tool: ${toolName}`, toolArgs)

        let output: any

        try {
          switch (toolName) {
            case 'inspect_schema':
              output = await inspectSchema()
              break

            case 'run_cypher':
              output = await runCypher(
                toolArgs.query,
                toolArgs.params,
                toolArgs.limit
              )
              break

            case 'run_gds':
              output = await runGDS(
                toolArgs.algo,
                toolArgs.graphProjection,
                toolArgs.params
              )
              break

            default:
              output = { error: `Unknown tool: ${toolName}` }
          }
        } catch (error: any) {
          output = { error: `Tool execution failed: ${error.message}` }
        }

        // Record in trace
        trace.push({
          tool: toolName,
          args: toolArgs,
          output,
          timestamp: Date.now()
        })

        // Add tool result to messages
        // Truncate large outputs to avoid token limits
        let outputString = JSON.stringify(output)
        if (outputString.length > 15000) {
          const truncated = JSON.parse(outputString)
          if (truncated.data && Array.isArray(truncated.data)) {
            truncated.data = truncated.data.slice(0, 10)
            truncated.note = `Truncated to first 10 rows (original: ${output.data?.length || 0} rows)`
          }
          outputString = JSON.stringify(truncated)
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolName,
          content: outputString.slice(0, 15000)
        })
      }

      // Add guidance for next iteration
      messages.push({
        role: 'system',
        content: 'If you need more evidence, plan the next query. Otherwise, produce a grounded final answer with citations to the tool outputs you received.'
      })
    }

    // Hit hop limit
    return {
      answer: 'Investigation incomplete. The analysis required more steps than the limit allows. You can ask me to continue or refine your question.',
      trace,
      tokensUsed: 0
    }

  } catch (error: any) {
    console.error('❌ Agent loop error:', error)
    return {
      answer: `Error during investigation: ${error.message}`,
      trace,
      tokensUsed: 0
    }
  }
}

/**
 * System prompt for the investigation agent
 */
export function getAgentSystemPrompt(emailId: string, emailContext?: string): string {
  return `You are EncryptGate Security Copilot, an expert email security analyst with access to a Neo4j graph database.

Your mission: Investigate suspicious emails using a systematic, multi-step approach.

**Database Schema:**
- Labels: User, Email, URL
- Relationships:
  - (User)-[:WAS_SENT]->(Email) - user sent the email
  - (Email)-[:WAS_SENT_TO]->(User) - email was sent to user
  - (Email)-[:CONTAINS_URL]->(URL) - email contains URL

**Investigation Context:**
${emailContext || 'Email ID: ' + emailId}

**Your Approach (ReAct-style reasoning):**
1. **PLAN** - Think about what evidence you need
2. **ACT** - Use tools to gather evidence
3. **OBSERVE** - Analyze the results
4. **REFLECT** - Decide if you need more data or can conclude

**Tools Available:**
- inspect_schema: View database structure (use first if unfamiliar)
- run_cypher: Execute Cypher queries (always parameterize, always use LIMIT)
- run_gds: Run Graph Data Science algorithms for pattern detection

**Best Practices:**
- Start with small preview queries (LIMIT 5) before heavy scans
- Use parameters ($param) instead of hardcoding values
- Cross-check findings from multiple angles
- Break complex investigations into simple steps
- Always cite specific evidence from tool outputs

**IMPORTANT - Email References:**
When you mention other emails in your response, ALWAYS include their Message IDs in angle brackets:
- "Similar email found: <123456.ABC@example.com>"
- "Sender previously sent Email: <messageId@domain.com>"
- "Related message: <previous-msg-id@example.com>"

This allows the analyst to click and view referenced emails directly.

**Output Format:**
Provide a well-formatted, professional security analysis:

## Summary
[2-3 sentences overview with **bold** key findings]

## Why This Email Was Flagged
- **Reason 1:** [description with evidence]
- **Reason 2:** [description with evidence]
- **Reason 3:** [description with evidence]

## Risk Assessment
**Risk Level:** Low/Medium/High/Critical
**Confidence:** Low/Medium/High

**Key Indicators:**
- [Indicator]: [description] (Evidence: Query X showed...)
- [Indicator]: [description]

## Investigation Evidence
[Cite specific query results, reference related emails with Message IDs]

## Recommended Actions
1. [Specific action based on risk level]
2. [Another action]
3. [Follow-up investigation if needed]

**Formatting Tips:**
- Use markdown (##, **, -, code blocks)
- Highlight: malware, phishing, suspicious, malicious, threat
- Reference emails with <messageId> in angle brackets
- Keep organized and scannable
- Bold important findings

**Important:**
- Be thorough but efficient (3-5 tool calls ideal)
- Ground all claims in data
- Reference related emails with their Message IDs
- Focus on security-relevant patterns
`
}
