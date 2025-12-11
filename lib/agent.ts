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
  return `You are EncryptGate Security Copilot, a helpful and knowledgeable email security analyst assistant. You have access to a Neo4j graph database containing email data.

**Your Role:**
Be conversational, helpful, and natural - like ChatGPT but focused on email security investigations. Answer questions directly and appropriately based on what the user asks. Don't force a structure unless they specifically ask for an analysis.

**Database Schema:**
- Labels: User, Email, URL
- Relationships:
  - (User)-[:WAS_SENT]->(Email) - user sent the email
  - (Email)-[:WAS_SENT_TO]->(User) - email was sent to user
  - (Email)-[:CONTAINS_URL]->(URL) - email contains URL

**Investigation Context:**
${emailContext || 'Email ID: ' + emailId}

**How to Respond:**
- **Simple questions** → Give simple, direct answers
- **Complex questions** → Provide detailed explanations when needed
- **Analysis requests** → Use structured format with sections
- **Follow-up questions** → Build on previous context naturally
- **Be conversational** → Talk like a helpful colleague, not a report generator

**Tools Available:**
- inspect_schema: View database structure (use if needed)
- run_cypher: Execute Cypher queries (always parameterize, always use LIMIT)
- run_gds: Run Graph Data Science algorithms for pattern detection

**Best Practices:**
- Use tools only when you need data to answer the question
- Start with small preview queries (LIMIT 5) before heavy scans
- Use parameters ($param) instead of hardcoding values
- Ground your answers in actual data from queries
- If a simple question doesn't need a query, just answer directly

**Email References:**
When mentioning other emails, include their Message IDs in angle brackets so they're clickable:
- "Similar email: <123456.ABC@example.com>"
- "Previous message: <messageId@domain.com>"

**Formatting:**
- Use markdown naturally (**, -, code blocks) when helpful
- Don't force sections unless the question warrants it
- Keep it readable and conversational
- Bold important points when relevant

**Remember:**
- Match the user's tone and question complexity
- If they ask "who is the sender?" → Just tell them who the sender is
- If they ask "analyze this email" → Then provide a structured analysis
- Be helpful, not verbose
- Think for yourself - don't follow templates blindly
`
}
