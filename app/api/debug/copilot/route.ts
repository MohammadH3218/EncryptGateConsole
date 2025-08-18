// app/api/debug/copilot/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { driver } from '@/lib/neo4j';

export async function GET() {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: {
      openrouterApiKey: !!process.env.OPENROUTER_API_KEY,
      openrouterModel: process.env.OPENROUTER_MODEL || 'not set',
      neo4jUri: process.env.NEO4J_URI || 'not set',
      neo4jUser: process.env.NEO4J_USER || 'not set',
      neo4jPassword: !!process.env.NEO4J_PASSWORD,
    },
    tests: {
      neo4jConnection: false,
      openrouterApi: false,
      emailData: false,
    },
    errors: [] as string[],
  };

  // Test Neo4j connection
  try {
    const session = driver.session();
    const result = await session.run('RETURN "Hello Neo4j" as message');
    await session.close();
    diagnostics.tests.neo4jConnection = true;
  } catch (error: any) {
    diagnostics.errors.push(`Neo4j Connection Error: ${error.message}`);
  }

  // Test OpenRouter API
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
      });
      if (response.ok) {
        diagnostics.tests.openrouterApi = true;
      } else {
        diagnostics.errors.push(`OpenRouter API Error: ${response.status} ${response.statusText}`);
      }
    } catch (error: any) {
      diagnostics.errors.push(`OpenRouter API Error: ${error.message}`);
    }
  } else {
    diagnostics.errors.push('OpenRouter API key not configured');
  }

  // Test for email data in Neo4j
  if (diagnostics.tests.neo4jConnection) {
    try {
      const session = driver.session();
      const result = await session.run('MATCH (e:Email) RETURN count(e) as emailCount');
      const emailCount = result.records[0]?.get('emailCount').toNumber() || 0;
      diagnostics.tests.emailData = emailCount > 0;
      
      if (emailCount === 0) {
        diagnostics.errors.push('No email data found in Neo4j database');
      }
      
      await session.close();
    } catch (error: any) {
      diagnostics.errors.push(`Email Data Check Error: ${error.message}`);
    }
  }

  return NextResponse.json(diagnostics);
}