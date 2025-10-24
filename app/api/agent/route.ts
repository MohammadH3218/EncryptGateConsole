// app/api/agent/route.ts - Agent loop API endpoint
import { NextRequest, NextResponse } from 'next/server'
import { agentLoop, getAgentSystemPrompt } from '@/lib/agent'
import { fetchEmailContext } from '@/lib/neo4j'
import { INVESTIGATION_PIPELINES, PipelineType } from '@/lib/investigation-pipelines'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/agent
 *
 * Execute the investigation agent loop
 *
 * Body:
 * - emailId: string (required) - Email message ID
 * - messages?: array - Conversation history
 * - pipeline?: string - Pre-defined pipeline to run (initialize, whyFlagged, etc.)
 * - question?: string - Custom question
 * - maxHops?: number - Maximum reasoning steps (default 8)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { emailId, messages, pipeline, question, maxHops = 8 } = body

    if (!emailId) {
      return NextResponse.json(
        { error: 'emailId is required' },
        { status: 400 }
      )
    }

    // Fetch email context from Neo4j
    let emailContext: string
    try {
      emailContext = await fetchEmailContext(emailId)
      if (!emailContext) {
        return NextResponse.json(
          {
            error: 'Email not found in database',
            emailId,
            suggestion: 'Ensure the email exists in Neo4j graph database'
          },
          { status: 404 }
        )
      }
    } catch (error: any) {
      console.error('Failed to fetch email context:', error)
      return NextResponse.json(
        {
          error: 'Failed to connect to Neo4j database',
          details: error.message,
          suggestion: 'Check Neo4j connection and ensure the database is running'
        },
        { status: 500 }
      )
    }

    // Build initial messages
    const initialMessages: any[] = []

    // System prompt
    initialMessages.push({
      role: 'system',
      content: getAgentSystemPrompt(emailId, emailContext)
    })

    // Add conversation history if provided
    if (messages && Array.isArray(messages)) {
      initialMessages.push(...messages)
    }

    // Add user prompt (pipeline or custom question)
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
      return NextResponse.json(
        { error: 'Either pipeline or question must be provided' },
        { status: 400 }
      )
    }

    // Run the agent loop
    console.log(`🚀 Starting agent loop for email: ${emailId}`)
    console.log(`📋 Pipeline: ${pipeline || 'custom'}`)
    console.log(`💭 Max hops: ${maxHops}`)

    const startTime = Date.now()
    const result = await agentLoop(initialMessages, maxHops)
    const duration = Date.now() - startTime

    console.log(`✅ Agent loop completed in ${duration}ms`)
    console.log(`📊 Tool calls: ${result.trace.length}`)
    console.log(`🎯 Answer length: ${result.answer.length} chars`)

    // Return result
    return NextResponse.json({
      success: true,
      emailId,
      pipeline: pipeline || 'custom',
      answer: result.answer,
      trace: result.trace,
      tokensUsed: result.tokensUsed,
      duration,
      metadata: {
        toolCalls: result.trace.length,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error: any) {
    console.error('❌ Agent API error:', error)

    return NextResponse.json(
      {
        error: 'Agent execution failed',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/agent
 *
 * Get available pipelines and agent status
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: 'ready',
    availablePipelines: Object.keys(INVESTIGATION_PIPELINES).map(key => {
      const pipeline = INVESTIGATION_PIPELINES[key as PipelineType]
      return {
        id: key,
        name: pipeline.name,
        description: pipeline.description,
        expectedSteps: pipeline.expectedSteps
      }
    }),
    tools: [
      {
        name: 'inspect_schema',
        description: 'View Neo4j database schema'
      },
      {
        name: 'run_cypher',
        description: 'Execute Cypher queries'
      },
      {
        name: 'run_gds',
        description: 'Run Graph Data Science algorithms'
      }
    ],
    limits: {
      maxHops: 8,
      defaultHops: 8,
      maxToolOutputSize: 15000
    }
  })
}
