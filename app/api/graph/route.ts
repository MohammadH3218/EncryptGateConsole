// app/api/graph/route.ts - Updated to use Parameter Store configuration
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOpenAIApiKey, validateOpenAIKey } from '@/lib/config';

// Validation schemas
const GraphRequestSchema = z.object({
  action: z.enum(['add_email', 'query_copilot', 'get_email_context', 'health_check']),
  data: z.any(),
});

type GraphRequest = z.infer<typeof GraphRequestSchema>;

// Dynamic import with better error handling
async function getCopilotService() {
  try {
    console.log('🔄 Importing copilot service...');
    const { getCopilotService } = await import('@/lib/copilot');
    const service = getCopilotService();
    console.log('✅ Copilot service imported successfully');
    return service;
  } catch (error: any) {
    console.error('❌ Failed to import copilot service:', error);
    
    // More specific error messages
    if (error.message?.includes('Neo4j')) {
      throw new Error('Neo4j connection failed. Please ensure Neo4j is running and accessible.');
    } else if (error.message?.includes('OpenAI') || error.message?.includes('Parameter Store')) {
      throw new Error(`OpenAI configuration failed: ${error.message}`);
    } else if (error.message?.includes('ECONNREFUSED')) {
      throw new Error('Database connection refused. Please check Neo4j is running on bolt://localhost:7687');
    } else {
      throw new Error(`Copilot service initialization failed: ${error.message}`);
    }
  }
}

// Enhanced health check function
async function performHealthCheck() {
  try {
    console.log('🏥 Starting comprehensive health check...');
    
    const healthStatus = {
      healthy: false,
      status: 'error',
      timestamp: new Date().toISOString(),
      services: {
        neo4j: false,
        llm: false,
        parameterStore: false
      },
      environment: {},
      error: null as string | null
    };

    // Check OpenAI configuration first
    try {
      console.log('🔑 Testing OpenAI configuration...');
      const apiKey = await getOpenAIApiKey();
      
      if (!validateOpenAIKey(apiKey)) {
        throw new Error('Invalid OpenAI API key format');
      }
      
      // Test actual API call
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Test' }],
          max_tokens: 5,
        }),
      });

      if (response.ok) {
        healthStatus.services.llm = true;
        healthStatus.services.parameterStore = true;
        console.log('✅ OpenAI API test passed');
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }
      
    } catch (openaiError: any) {
      console.error('❌ OpenAI configuration test failed:', openaiError);
      healthStatus.error = `OpenAI configuration failed: ${openaiError.message}`;
      
      // Determine if it's a parameter store issue or API issue
      if (openaiError.message?.includes('Parameter') || openaiError.message?.includes('not found')) {
        healthStatus.services.parameterStore = false;
      } else if (openaiError.message?.includes('401') || openaiError.message?.includes('Invalid')) {
        healthStatus.services.parameterStore = true; // We could load it, but it's invalid
      }
      
      return healthStatus;
    }

    // Test Neo4j connection
    try {
      console.log('🔗 Testing Neo4j connection...');
      const { testNeo4jConnection } = await import('@/lib/neo4j');
      const neo4jHealthy = await testNeo4jConnection();
      
      if (!neo4jHealthy) {
        throw new Error('Neo4j connection test failed');
      }
      
      healthStatus.services.neo4j = true;
      console.log('✅ Neo4j connection test passed');
      
    } catch (neo4jError: any) {
      console.error('❌ Neo4j connection test failed:', neo4jError);
      healthStatus.error = `Neo4j error: ${neo4jError.message}`;
      return healthStatus;
    }

    // Test copilot service integration
    try {
      console.log('🤖 Testing copilot service integration...');
      const copilot = await getCopilotService();
      const isHealthy = await copilot.isHealthy();
      
      if (isHealthy) {
        healthStatus.healthy = true;
        healthStatus.status = 'operational';
        healthStatus.error = null;
        console.log('✅ All health checks passed');
      } else {
        healthStatus.status = 'degraded';
        healthStatus.error = 'Copilot service health check failed';
      }
      
    } catch (copilotError: any) {
      console.error('❌ Copilot service test failed:', copilotError);
      healthStatus.status = 'degraded';
      healthStatus.error = `Copilot service error: ${copilotError.message}`;
    }
    
    return healthStatus;
    
  } catch (error: any) {
    console.error('❌ Health check failed:', error);
    return {
      healthy: false,
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message,
      services: {
        neo4j: false,
        llm: false,
        parameterStore: false
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

    // Get copilot service for other actions with better error handling
    let copilot;
    try {
      copilot = await getCopilotService();
      console.log('✅ Copilot service obtained successfully');
    } catch (error: any) {
      console.error('❌ Failed to get copilot service:', error);
      return NextResponse.json(
        { 
          error: 'Service unavailable', 
          message: error.message,
          troubleshooting: [
            'Ensure Neo4j is running: `neo4j start` or check Neo4j Desktop',
            'Verify Neo4j connection settings in environment variables',
            'Check OpenAI API key is configured in Parameter Store',
            'Test Neo4j connection manually at http://localhost:7474',
            'Run diagnostic test at /api/copilot-test'
          ]
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

          console.log('📧 Adding email to graph:', {
            messageId: emailData.messageId,
            sender: emailData.sender,
            recipients: emailData.recipients?.length || 0
          });

          // Extract URLs if none provided
          if (!emailData.urls && typeof emailData.body === 'string') {
            const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
            emailData.urls = emailData.body.match(urlRegex) || [];
            console.log(`🔗 Extracted ${emailData.urls.length} URLs from email body`);
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
            messageId: emailData.messageId,
            urlsFound: emailData.urls?.length || 0
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

          console.log('🤖 Processing copilot question:', {
            question: question.substring(0, 100) + (question.length > 100 ? '...' : ''),
            hasMessageId: !!messageId,
            hasContext: !!context
          });

          // Lazy-load context if needed
          let emailContext = context;
          if (messageId && !emailContext) {
            try {
              emailContext = await copilot.getEmailContext(messageId);
              console.log('📧 Email context loaded for:', messageId);
            } catch (contextError: any) {
              console.warn('⚠️ Failed to load email context:', contextError.message);
              // Continue without context
            }
          }

          // Process the question with timeout
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Query timeout')), 30000); // 30 second timeout
          });

          const queryPromise = copilot.processQuestion(question, emailContext);
          
          const result = await Promise.race([queryPromise, timeoutPromise]) as any;

          console.log(`✅ Copilot processed question successfully`);
          return NextResponse.json({
            response: result.response,
            confidence: result.confidence || 85,
            error: result.error,
            context: emailContext
          });

        } catch (error: any) {
          console.error('Failed to process copilot query:', error);
          
          let errorMessage = 'Failed to process question';
          let userResponse = 'I encountered an error processing your question. Please try rephrasing your question or ask something different.';
          
          if (error.message === 'Query timeout') {
            errorMessage = 'Query timed out. Please try a simpler question.';
            userResponse = 'Your question timed out. Please try asking a simpler or more specific question.';
          } else if (error.message.includes('connection') || error.message.includes('Neo4j')) {
            errorMessage = 'Database connection error. Please try again.';
            userResponse = 'I cannot connect to the email database right now. Please ensure Neo4j is running and try again.';
          } else if (error.message.includes('OpenAI') || error.message.includes('API') || error.message.includes('Parameter Store')) {
            errorMessage = 'AI service configuration error. Please try again.';
            userResponse = 'The AI service configuration has an issue. Please check the OpenAI API key configuration.';
          } else if (error.message.includes('ECONNREFUSED')) {
            errorMessage = 'Neo4j connection refused';
            userResponse = 'Cannot connect to Neo4j database. Please ensure Neo4j is running on port 7687.';
          }

          return NextResponse.json(
            { 
              error: errorMessage,
              response: userResponse,
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

          console.log('📧 Getting email context for:', messageId);
          const ctx = await copilot.getEmailContext(messageId);
          
          if (ctx) {
            console.log(`✅ Context retrieved for: ${messageId}`);
          } else {
            console.log(`⚠️ No context found for: ${messageId}`);
          }
          
          return NextResponse.json({ 
            context: ctx, 
            messageId,
            success: !!ctx
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
      version: '3.0.0-parameter-store',
      documentation: {
        healthCheck: 'POST with action: "health_check"',
        addEmail: 'POST with action: "add_email" and email data',
        queryCopilot: 'POST with action: "query_copilot" and question',
        getContext: 'POST with action: "get_email_context" and messageId'
      },
      configuration: {
        openaiSource: 'AWS Parameter Store',
        parameterName: 'encryptgate-openai-key'
      }
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