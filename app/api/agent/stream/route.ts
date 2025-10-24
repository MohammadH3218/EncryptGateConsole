// app/api/agent/stream/route.ts - Streaming agent API with SSE
import { NextRequest } from 'next/server'
import { agentLoopStream } from '@/lib/agent-stream'
import { getAgentSystemPrompt } from '@/lib/agent'
import { fetchEmailContext } from '@/lib/neo4j'
import { INVESTIGATION_PIPELINES, PipelineType } from '@/lib/investigation-pipelines'
import {
  createInvestigationSession,
  addMessageToSession,
  completeSession,
  getLatestSession
} from '@/lib/investigation-history'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/agent/stream
 *
 * Streaming investigation with Server-Sent Events (SSE)
 * Returns real-time updates as the agent thinks and executes tools
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { emailId, messages, pipeline, question, maxHops = 8 } = body

    if (!emailId) {
      return new Response(
        JSON.stringify({ error: 'emailId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Fetch email context
    let emailContext: string
    try {
      emailContext = await fetchEmailContext(emailId)
      if (!emailContext) {
        return new Response(
          JSON.stringify({ error: 'Email not found in database', emailId }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      }
    } catch (error: any) {
      return new Response(
        JSON.stringify({ error: 'Failed to connect to Neo4j', details: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Build initial messages
    const initialMessages: any[] = []

    initialMessages.push({
      role: 'system',
      content: getAgentSystemPrompt(emailId, emailContext)
    })

    if (messages && Array.isArray(messages)) {
      initialMessages.push(...messages)
    }

    if (pipeline && pipeline in INVESTIGATION_PIPELINES) {
      const pipelineConfig = INVESTIGATION_PIPELINES[pipeline as PipelineType]
      initialMessages.push({
        role: 'user',
        content: pipelineConfig.prompt
      })
    } else if (question) {
      initialMessages.push({
        role: 'user',
        content: question
      })
    } else {
      return new Response(
        JSON.stringify({ error: 'Either pipeline or question must be provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Create or get investigation session for auto-save
    let sessionId: string
    try {
      const latestSession = await getLatestSession(emailId)
      if (latestSession && latestSession.status === 'active') {
        sessionId = latestSession.sessionId
        console.log(`📝 Using existing session: ${sessionId}`)
      } else {
        sessionId = await createInvestigationSession(emailId, undefined, {
          pipeline: pipeline || 'custom'
        })
        console.log(`📝 Created new session: ${sessionId}`)
      }
    } catch (error) {
      console.error('Failed to create session, continuing without auto-save:', error)
      sessionId = '' // Continue without auto-save
    }

    // Save user message
    const userMessage = pipeline
      ? INVESTIGATION_PIPELINES[pipeline as PipelineType].name
      : question

    if (sessionId) {
      try {
        await addMessageToSession(sessionId, {
          role: 'user',
          content: userMessage || 'Investigation query',
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        console.error('Failed to save user message:', error)
      }
    }

    // Create SSE stream
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const thinking: any = {
          steps: [],
          toolCalls: [],
          toolResults: []
        }
        let finalAnswer = ''
        let totalTokens = 0
        let duration = 0
        const startTime = Date.now()

        try {
          // Send initial metadata
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'start',
              data: { emailId, pipeline: pipeline || 'custom', sessionId },
              timestamp: Date.now()
            })}\n\n`)
          )

          // Stream agent events and collect for auto-save
          for await (const event of agentLoopStream(initialMessages, maxHops)) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            )

            // Collect thinking data for auto-save
            if (event.type === 'thinking') {
              thinking.steps.push(event.data)
            } else if (event.type === 'tool_call') {
              thinking.toolCalls.push(event.data)
            } else if (event.type === 'tool_result') {
              thinking.toolResults.push(event.data)
            } else if (event.type === 'answer') {
              finalAnswer = event.data.content
              totalTokens = event.data.tokensUsed || 0
            }
          }

          duration = Date.now() - startTime

          // Auto-save assistant response
          if (sessionId) {
            try {
              await addMessageToSession(sessionId, {
                role: 'assistant',
                content: finalAnswer,
                timestamp: new Date().toISOString(),
                thinking,
                tokensUsed: totalTokens,
                duration
              })
              console.log(`💾 Auto-saved response to session ${sessionId}`)
            } catch (error) {
              console.error('Failed to save assistant message:', error)
            }
          }

          // Close stream
          controller.close()
        } catch (error: any) {
          console.error('Streaming error:', error)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              data: { message: error.message },
              timestamp: Date.now()
            })}\n\n`)
          )
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    })

  } catch (error: any) {
    console.error('Stream API error:', error)
    return new Response(
      JSON.stringify({ error: 'Stream setup failed', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
