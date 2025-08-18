// app/api/graph/route.ts - FIXED VERSION
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { z } from 'zod';

// Validation schemas
const GraphRequestSchema = z.object({
  action: z.enum(['add_email', 'query_copilot', 'get_email_context', 'health_check']),
  data: z.any(),
});

type GraphRequest = z.infer<typeof GraphRequestSchema>;

// Dynamic import to handle potential missing dependencies
async function getCopilotService() {
  try {
    const { getCopilotService } = await import('@/lib/copilot');
    return getCopilotService();
  } catch (error) {
    console.error('Failed to import copilot service:', error);
    throw new Error('Copilot service not available. Please check your configuration.');
  }
}

// Health check function
async function performHealthCheck() {
  try {
    const copilot = await getCopilotService();
    const isHealthy = await copilot.isHealthy();
    
    return {
      healthy: isHealthy,
      status: isHealthy ? 'operational' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        neo4j: isHealthy,
        llm: true,
      }
    };
  } catch (error) {
    return {
      healthy: false,
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      services: {
        neo4j: false,
        llm: true,
      }
    };
  }
}

export async function POST(req: Request) {
  let payload: any;

  try {
    // Parse and validate request
    try {
      payload = await req.json();
    } catch (err) {
      console.error('[POST /api/graph] invalid JSON', err);
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    let graphReq: GraphRequest;
    try {
      graphReq = GraphRequestSchema.parse(payload);
    } catch (err: any) {
      console.error('[POST /api/graph] validation failed', err);
      return NextResponse.json(
        { error: 'Bad request', details: err.errors || err.message },
        { status: 400 }
      );
    }

    console.log(`🔍 Processing graph action: ${graphReq.action}`);

    // Handle health check first (doesn't require copilot service)
    if (graphReq.action === 'health_check') {
      const healthStatus = await performHealthCheck();
      return NextResponse.json(healthStatus);
    }

    // Get copilot service for other actions
    let copilot;
    try {
      copilot = await getCopilotService();
    } catch (error) {
      console.error('Failed to get copilot service:', error);
      return NextResponse.json(
        { 
          error: 'Service unavailable', 
          message: 'Copilot service is not available. Please check your configuration.',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 503 }
      );
    }

    switch (graphReq.action) {
      // Add a new email node + relationships
      case 'add_email': {
        try {
          const emailData = graphReq.data as {
            messageId: string;
            sender: string;
            recipients?: string[];
            subject?: string;
            body?: string;
            timestamp: string;
            urls?: string[];
          };

          // Validate required fields
          if (!emailData.messageId || !emailData.sender || !emailData.timestamp) {
            return NextResponse.json(
              { error: 'Missing required fields: messageId, sender, timestamp' },
              { status: 400 }
            );
          }

          // Extract URLs if none provided
          if (!emailData.urls && typeof emailData.body === 'string') {
            const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
            emailData.urls = emailData.body.match(urlRegex) || [];
          }

          await copilot.addEmail({
            messageId: emailData.messageId,
            sender: emailData.sender,
            recipients: emailData.recipients || [],
            subject: emailData.subject || '',
            body: emailData.body || '',
            timestamp: emailData.timestamp,
            urls: emailData.urls || []
          });

          console.log(`✅ Email added to graph: ${emailData.messageId}`);
          return NextResponse.json({
            success: true,
            message: 'Email added to graph database',
            messageId: emailData.messageId
          });

        } catch (error: any) {
          console.error('Failed to add email:', error);
          return NextResponse.json(
            { 
              error: 'Failed to add email to graph', 
              message: error.message,
              details: error.stack?.split('\n').slice(0, 3).join('\n')
            },
            { status: 500 }
          );
        }
      }

      // Run a Copilot query against the graph
      case 'query_copilot': {
        try {
          const { question, messageId, context } = graphReq.data as {
            question: string;
            messageId?: string;
            context?: string;
          };

          if (!question || typeof question !== 'string' || question.trim().length === 0) {
            return NextResponse.json(
              { error: 'Question is required and must be a non-empty string' },
              { status: 400 }
            );
          }

          // Lazy-load context if needed
          let emailContext = context;
          if (messageId && !emailContext) {
            emailContext = await copilot.getEmailContext(messageId);
          }

          // Process the question with timeout
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Query timeout')), 25000); // 25 second timeout
          });

          const queryPromise = copilot.processQuestion(question, emailContext);
          
          const result = await Promise.race([queryPromise, timeoutPromise]) as any;

          console.log(`🤖 Copilot processed: ${question}`);
          return NextResponse.json({
            response: result.response,
            confidence: result.confidence || 85,
            error: result.error,
            context: emailContext
          });

        } catch (error: any) {
          console.error('Failed to process copilot query:', error);
          
          let errorMessage = 'Failed to process question';
          if (error.message === 'Query timeout') {
            errorMessage = 'Query timed out. Please try a simpler question.';
          } else if (error.message.includes('connection')) {
            errorMessage = 'Database connection error. Please try again.';
          }

          return NextResponse.json(
            { 
              error: errorMessage,
              response: `I encountered an error: ${error.message}. Please try rephrasing your question.`,
              confidence: 0,
              details: error.message
            },
            { status: 500 }
          );
        }
      }

      // Just fetch the email context (for previewing)
      case 'get_email_context': {
        try {
          const { messageId } = graphReq.data as { messageId?: string };
          
          if (!messageId) {
            return NextResponse.json(
              { error: 'messageId is required' },
              { status: 400 }
            );
          }

          const ctx = await copilot.getEmailContext(messageId);
          console.log(`📧 Context retrieved: ${messageId}`);
          
          return NextResponse.json({ 
            context: ctx, 
            messageId,
            success: true
          });

        } catch (error: any) {
          console.error('Failed to get email context:', error);
          return NextResponse.json(
            { 
              error: 'Failed to retrieve email context', 
              message: error.message,
              context: null,
              messageId: graphReq.data?.messageId
            },
            { status: 500 }
          );
        }
      }

      // Unknown action
      default: {
        return NextResponse.json(
          { error: 'Unknown action', supportedActions: ['add_email', 'query_copilot', 'get_email_context', 'health_check'] },
          { status: 400 }
        );
      }
    }

  } catch (err: any) {
    console.error('[POST /api/graph] unexpected error', err);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        message: err.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Simple health check endpoint
  try {
    const healthStatus = await performHealthCheck();
    return NextResponse.json({
      ...healthStatus,
      message: 'Graph API is running',
      endpoints: {
        POST: 'Main endpoint for graph operations',
        GET: 'Health check endpoint'
      },
      version: '2.0.0'
    });
  } catch (error) {
    return NextResponse.json(
      { 
        healthy: false, 
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}