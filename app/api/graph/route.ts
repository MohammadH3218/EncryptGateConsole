// app/api/graph/route.ts - Updated to remove copilot dependencies
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOpenAIApiKey, validateOpenAIKey } from '@/lib/config';
import { ensureNeo4jConnection, testNeo4jConnection } from '@/lib/neo4j';

// Validation schemas
const GraphRequestSchema = z.object({
  action: z.enum(['add_email', 'get_email_context', 'health_check']),
  data: z.any(),
});

type GraphRequest = z.infer<typeof GraphRequestSchema>;

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

      if (openaiError.message?.includes('Parameter') || openaiError.message?.includes('not found')) {
        healthStatus.services.parameterStore = false;
      } else if (openaiError.message?.includes('401') || openaiError.message?.includes('Invalid')) {
        healthStatus.services.parameterStore = true;
      }

      return healthStatus;
    }

    // Test Neo4j connection
    try {
      console.log('🔗 Testing Neo4j connection...');
      const neo4jHealthy = await testNeo4jConnection();

      if (!neo4jHealthy) {
        throw new Error('Neo4j connection test failed');
      }

      healthStatus.services.neo4j = true;
      healthStatus.healthy = true;
      healthStatus.status = 'operational';
      healthStatus.error = null;
      console.log('✅ All health checks passed');

    } catch (neo4jError: any) {
      console.error('❌ Neo4j connection test failed:', neo4jError);
      healthStatus.error = `Neo4j error: ${neo4jError.message}`;
      return healthStatus;
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

// Add email to Neo4j graph
async function addEmailToGraph(emailData: any) {
  try {
    const neo4j = await ensureNeo4jConnection();

    // Create user nodes and email node with relationships
    const query = `
      // Create or merge sender
      MERGE (sender:User {email: $senderEmail})
      ON CREATE SET sender.createdAt = datetime()

      // Create email node
      CREATE (e:Email {
        messageId: $messageId,
        subject: $subject,
        body: $body,
        sentDate: $sentDate,
        direction: $direction,
        size: $size
      })

      // Create relationship: sender sent email
      CREATE (sender)-[:WAS_SENT]->(e)

      // Create or merge recipients and relationships
      WITH e
      UNWIND $recipients AS recipientEmail
      MERGE (recipient:User {email: recipientEmail})
      ON CREATE SET recipient.createdAt = datetime()
      CREATE (e)-[:WAS_SENT_TO]->(recipient)

      // Handle URLs if present
      WITH e
      UNWIND CASE WHEN $urls IS NOT NULL THEN $urls ELSE [] END AS urlString
      MERGE (url:URL {url: urlString})
      ON CREATE SET url.createdAt = datetime()
      CREATE (e)-[:CONTAINS_URL]->(url)

      RETURN e.messageId as messageId
    `;

    const result = await neo4j.runQuery(query, {
      messageId: emailData.messageId,
      senderEmail: emailData.sender || emailData.from,
      subject: emailData.subject || '',
      body: emailData.body || emailData.bodyText || '',
      sentDate: emailData.timestamp || emailData.receivedAt || new Date().toISOString(),
      direction: emailData.direction || 'unknown',
      size: emailData.size || 0,
      recipients: emailData.recipients || emailData.to || [],
      urls: emailData.urls || null
    });

    return { success: true, messageId: emailData.messageId };
  } catch (error: any) {
    console.error('❌ Failed to add email to graph:', error);
    throw new Error(`Failed to add email to graph: ${error.message}`);
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

    // Handle health check
    if (graphReq.action === 'health_check') {
      const healthStatus = await performHealthCheck();
      return NextResponse.json(healthStatus);
    }

    // Handle add_email action
    if (graphReq.action === 'add_email') {
      const result = await addEmailToGraph(graphReq.data);
      return NextResponse.json(result);
    }

    // Handle get_email_context action
    if (graphReq.action === 'get_email_context') {
      const { fetchEmailContext } = await import('@/lib/neo4j');
      const messageId = graphReq.data?.messageId || graphReq.data?.emailId;

      if (!messageId) {
        return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
      }

      const context = await fetchEmailContext(messageId);
      return NextResponse.json({ context });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  } catch (err: any) {
    console.error('[POST /api/graph] error:', err);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: err.message,
        action: payload?.action
      },
      { status: 500 }
    );
  }
}
