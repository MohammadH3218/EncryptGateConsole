// app/api/test-neo4j/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import neo4j from 'neo4j-driver';
import { getNeo4jConfig } from '@/lib/config';

export async function GET() {
  let diagnostics = {
    timestamp: new Date().toISOString(),
    neo4j: {
      uri: 'unknown',
      user: 'unknown',
      encrypted: false,
      status: 'unknown',
      error: null as string | null,
      testResult: null as any
    }
  };

  // Get config from Parameter Store or environment
  let config;
  try {
    config = await getNeo4jConfig();
    diagnostics.neo4j.uri = config.uri;
    diagnostics.neo4j.user = config.user;
    diagnostics.neo4j.encrypted = config.encrypted;
  } catch (error: any) {
    diagnostics.neo4j.status = 'config_error';
    diagnostics.neo4j.error = `Failed to load config: ${error.message}`;
    return NextResponse.json(diagnostics, { status: 500 });
  }

  // Test Neo4j connection directly
  let driver: neo4j.Driver | null = null;
  
  try {
    console.log('🔍 Creating Neo4j driver...');
    driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.user, config.password),
      { encrypted: config.encrypted }
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