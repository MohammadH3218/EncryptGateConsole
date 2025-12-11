// app/api/test-neo4j-connection/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { testNeo4jConnection } from '@/lib/neo4j';
import { getNeo4jConfig, getOpenAIApiKey } from '@/lib/config';

export async function GET() {
  try {
    console.log('🔍 Testing Neo4j connection...');

    // Get config
    const config = await getNeo4jConfig();
    console.log('📋 Neo4j Config:', {
      uri: config.uri,
      user: config.user,
      encrypted: config.encrypted,
      passwordSet: !!config.password
    });

    // Test OpenAI key
    let openAIStatus = 'not checked';
    try {
      const apiKey = await getOpenAIApiKey();
      openAIStatus = apiKey ? `✅ Available (${apiKey.substring(0, 10)}...)` : '❌ Missing';
    } catch (error: any) {
      openAIStatus = `❌ Error: ${error.message}`;
    }

    // Test Neo4j connection
    const isConnected = await testNeo4jConnection();

    return NextResponse.json({
      success: isConnected,
      neo4j: {
        connected: isConnected,
        uri: config.uri,
        user: config.user,
        encrypted: config.encrypted
      },
      openai: {
        status: openAIStatus
      },
      message: isConnected
        ? '✅ Neo4j connection successful!'
        : '❌ Neo4j connection failed. Check logs for details.'
    });

  } catch (error: any) {
    console.error('❌ Test failed:', error);

    return NextResponse.json({
      success: false,
      error: error.message,
      details: error.stack
    }, { status: 500 });
  }
}
