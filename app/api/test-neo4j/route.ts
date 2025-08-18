// app/api/test-neo4j/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import neo4j from 'neo4j-driver';

export async function GET() {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    neo4j: {
      uri: 'bolt://localhost:7687',
      user: 'neo4j',
      encrypted: false,
      status: 'unknown',
      error: null as string | null,
      testResult: null as any
    }
  };

  // Test Neo4j connection directly
  let driver: neo4j.Driver | null = null;
  
  try {
    console.log('🔍 Creating Neo4j driver...');
    driver = neo4j.driver(
      'bolt://localhost:7687',
      neo4j.auth.basic('neo4j', 'REDACTED_PASSWORD'),
      { encrypted: false }
    );

    console.log('🔍 Testing connection...');
    const session = driver.session();
    
    try {
      const result = await session.run('RETURN "Connection successful!" as message, datetime() as timestamp');
      const record = result.records[0];
      
      diagnostics.neo4j.status = 'connected';
      diagnostics.neo4j.testResult = {
        message: record.get('message'),
        timestamp: record.get('timestamp').toString()
      };
      
      console.log('✅ Neo4j connection successful');
    } finally {
      await session.close();
    }
    
  } catch (error: any) {
    console.error('❌ Neo4j connection failed:', error);
    diagnostics.neo4j.status = 'failed';
    diagnostics.neo4j.error = error.message;
  } finally {
    if (driver) {
      await driver.close();
    }
  }

  return NextResponse.json(diagnostics);
}