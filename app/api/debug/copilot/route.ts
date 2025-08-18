// app/api/debug/copilot/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { driver } from '@/lib/neo4j';

export async function GET() {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: {
      openaiApiKey: true,
      openaiModel: 'gpt-4o-mini',
      neo4jUri: 'bolt://localhost:7687',
      neo4jUser: 'neo4j',
      neo4jPassword: true,
    },
    tests: {
      neo4jConnection: false,
      openaiApi: false,
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

  // Test OpenAI API
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer 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`,
      },
    });
    if (response.ok) {
      diagnostics.tests.openaiApi = true;
    } else {
      diagnostics.errors.push(`OpenAI API Error: ${response.status} ${response.statusText}`);
    }
  } catch (error: any) {
    diagnostics.errors.push(`OpenAI API Error: ${error.message}`);
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