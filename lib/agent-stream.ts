// lib/agent-stream.ts - Streaming agent with real-time updates
import { getOpenAIApiKey } from './config'
import { inspectSchema, runCypher, runGDS } from './agent'

export interface StreamEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'answer' | 'error' | 'done'
  data?: any
  timestamp: number
}

export interface ThinkingStep {
  step: number
  totalSteps: number
  action: string
  reasoning?: string
}

export interface ToolCallEvent {
  toolName: string
  args: any
  timestamp: number
}

export interface ToolResultEvent {
  toolName: string
  result: any
  success: boolean
  timestamp: number
}

/**
 * Streaming agent loop that yields events as they happen
 */
export async function* agentLoopStream(
  initialMessages: any[],
  maxHops: number = 8
): AsyncGenerator<StreamEvent> {
  const trace: any[] = []
  const messages: any[] = [...initialMessages]

  try {
    const apiKey = await getOpenAIApiKey()
    if (!apiKey) {
      yield {
        type: 'error',
        data: { message: 'OpenAI API key not available' },
        timestamp: Date.now()
      }
      return
    }

    for (let hop = 0; hop < maxHops; hop++) {
      // Emit thinking event
      yield {
        type: 'thinking',
        data: {
          step: hop + 1,
          totalSteps: maxHops,
          action: hop === 0 ? 'Starting investigation...' : 'Analyzing results and planning next step...'
        } as ThinkingStep,
        timestamp: Date.now()
      }

      // Call OpenAI
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: messages,
          tools: [
            {
              type: 'function',
              function: {
                name: 'inspect_schema',
                description: 'Return Neo4j graph schema',
                parameters: { type: 'object', properties: {}, additionalProperties: false }
              }
            },
            {
              type: 'function',
              function: {
                name: 'run_cypher',
                description: 'Execute a READ-ONLY Cypher query',
                parameters: {
                  type: 'object',
                  properties: {
                    query: { type: 'string' },
                    params: { type: 'object' },
                    limit: { type: 'number' }
                  },
                  required: ['query']
                }
              }
            },
            {
              type: 'function',
              function: {
                name: 'run_gds',
                description: 'Run Graph Data Science algorithm',
                parameters: {
                  type: 'object',
                  properties: {
                    algo: { type: 'string' },
                    graphProjection: { type: 'object' },
                    params: { type: 'object' }
                  },
                  required: ['algo']
                }
              }
            }
          ],
          tool_choice: 'auto',
          temperature: 0.2,
          max_tokens: 2000
        })
      })

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`)
      }

      const data = await response.json()
      const message = data.choices?.[0]?.message

      if (!message) {
        throw new Error('No message in OpenAI response')
      }

      messages.push(message)

      // Check if model wants to use tools
      if (!message.tool_calls || message.tool_calls.length === 0) {
        // Final answer
        yield {
          type: 'answer',
          data: {
            content: message.content,
            tokensUsed: data.usage?.total_tokens
          },
          timestamp: Date.now()
        }

        yield {
          type: 'done',
          data: { trace, tokensUsed: data.usage?.total_tokens },
          timestamp: Date.now()
        }
        return
      }

      // Execute tools and stream results
      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function.name
        const toolArgs = JSON.parse(toolCall.function.arguments || '{}')

        // Emit tool call event
        yield {
          type: 'tool_call',
          data: {
            toolName,
            args: toolArgs,
            timestamp: Date.now()
          } as ToolCallEvent,
          timestamp: Date.now()
        }

        let output: any
        let success = true

        try {
          switch (toolName) {
            case 'inspect_schema':
              output = await inspectSchema()
              break
            case 'run_cypher':
              output = await runCypher(toolArgs.query, toolArgs.params, toolArgs.limit)
              break
            case 'run_gds':
              output = await runGDS(toolArgs.algo, toolArgs.graphProjection, toolArgs.params)
              break
            default:
              output = { error: `Unknown tool: ${toolName}` }
              success = false
          }
        } catch (error: any) {
          output = { error: `Tool execution failed: ${error.message}` }
          success = false
        }

        // Emit tool result
        yield {
          type: 'tool_result',
          data: {
            toolName,
            result: output,
            success,
            timestamp: Date.now()
          } as ToolResultEvent,
          timestamp: Date.now()
        }

        // Add to trace
        trace.push({
          tool: toolName,
          args: toolArgs,
          output,
          timestamp: Date.now()
        })

        // Add to messages
        let outputString = JSON.stringify(output)
        if (outputString.length > 15000) {
          const truncated = JSON.parse(outputString)
          if (truncated.data && Array.isArray(truncated.data)) {
            truncated.data = truncated.data.slice(0, 10)
            truncated.note = `Truncated to first 10 rows`
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
        content: 'If you need more evidence, plan the next query. Otherwise, produce a grounded final answer.'
      })
    }

    // Hit hop limit
    yield {
      type: 'answer',
      data: {
        content: 'Investigation incomplete. Reached step limit. You can ask me to continue.',
      },
      timestamp: Date.now()
    }

    yield {
      type: 'done',
      data: { trace },
      timestamp: Date.now()
    }

  } catch (error: any) {
    yield {
      type: 'error',
      data: { message: error.message },
      timestamp: Date.now()
    }
  }
}
