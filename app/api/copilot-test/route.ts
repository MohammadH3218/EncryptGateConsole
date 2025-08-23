// app/api/copilot-test/route.ts - COMPLETE DIAGNOSTIC ENDPOINT
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

export async function GET() {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: {
      neo4j: {
        uri: process.env.NEO4J_URI || 'Not set (will use default: bolt://localhost:7687)',
        user: process.env.NEO4J_USER || 'Not set (will use default: neo4j)',
        password: process.env.NEO4J_PASSWORD ? '***SET***' : 'Not set (will use default: Qwe!1234)',
        encrypted: process.env.NEO4J_ENCRYPTED || 'Not set (will use default: false)',
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY ? '***SET***' : 'Not set - REQUIRED',
        model: process.env.OPENAI_MODEL || 'Not set (will use default: gpt-4o-mini)'
      }
    },
    tests: {
      neo4j: { status: 'unknown', error: null as string | null, details: {} },
      openai: { status: 'unknown', error: null as string | null, details: {} },
      copilot: { status: 'unknown', error: null as string | null, details: {} }
    }
  };

  console.log('🧪 Starting comprehensive diagnostic tests...');

  // Test 1: Neo4j Connection
  try {
    console.log('🔍 Testing Neo4j connection...');
    const { testNeo4jConnection, getDriver } = await import('@/lib/neo4j');
    const neo4jConnected = await testNeo4jConnection();
    
    if (neo4jConnected) {
      diagnostics.tests.neo4j.status = 'connected';
      
      // Test basic query
      try {
        const driver = getDriver();
        const session = driver.session();
        const result = await session.run('MATCH (n) RETURN count(n) as nodeCount LIMIT 1');
        const nodeCount = result.records[0]?.get('nodeCount')?.toNumber() || 0;
        await session.close();
        
        diagnostics.tests.neo4j.details = {
          nodeCount,
          hasData: nodeCount > 0
        };
        
        console.log(`✅ Neo4j connected with ${nodeCount} nodes`);
      } catch (queryError: any) {
        diagnostics.tests.neo4j.details = { queryError: queryError.message };
        console.warn('⚠️ Neo4j connected but query failed:', queryError.message);
      }
    } else {
      diagnostics.tests.neo4j.status = 'failed';
      diagnostics.tests.neo4j.error = 'Connection test returned false';
      console.log('❌ Neo4j connection test failed');
    }
  } catch (error: any) {
    diagnostics.tests.neo4j.status = 'error';
    diagnostics.tests.neo4j.error = error.message;
    console.error('❌ Neo4j connection error:', error.message);
    
    // Check for specific error types
    if (error.message.includes('ECONNREFUSED')) {
      diagnostics.tests.neo4j.details = {
        issue: 'Connection refused - Neo4j not running',
        solution: 'Start Neo4j: `neo4j start` or check Neo4j Desktop'
      };
    } else if (error.message.includes('authentication')) {
      diagnostics.tests.neo4j.details = {
        issue: 'Authentication failed',
        solution: 'Check NEO4J_PASSWORD environment variable'
      };
    }
  }

  // Test 2: OpenAI API
  try {
    if (process.env.OPENAI_API_KEY) {
      console.log('🔍 Testing OpenAI API...');
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Test connection - respond with OK' }],
          max_tokens: 5,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const responseText = data.choices?.[0]?.message?.content || '';
        diagnostics.tests.openai.status = 'connected';
        diagnostics.tests.openai.details = {
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          responseReceived: !!responseText
        };
        console.log('✅ OpenAI API test passed');
      } else {
        const errorData = await response.json().catch(() => ({}));
        diagnostics.tests.openai.status = 'failed';
        diagnostics.tests.openai.error = `HTTP ${response.status}: ${errorData.error?.message || response.statusText}`;
        
        if (response.status === 401) {
          diagnostics.tests.openai.details = {
            issue: 'Invalid API key',
            solution: 'Check OPENAI_API_KEY is valid and has credits'
          };
        } else if (response.status === 429) {
          diagnostics.tests.openai.details = {
            issue: 'Rate limit or quota exceeded',
            solution: 'Check your OpenAI usage and billing'
          };
        }
        
        console.log('❌ OpenAI API test failed:', response.status);
      }
    } else {
      diagnostics.tests.openai.status = 'no_key';
      diagnostics.tests.openai.error = 'OPENAI_API_KEY not set';
      diagnostics.tests.openai.details = {
        issue: 'Missing API key',
        solution: 'Set OPENAI_API_KEY environment variable'
      };
      console.log('⚠️ OpenAI API key not found');
    }
  } catch (error: any) {
    diagnostics.tests.openai.status = 'error';
    diagnostics.tests.openai.error = error.message;
    diagnostics.tests.openai.details = {
      issue: 'Network or API error',
      solution: 'Check internet connection and OpenAI service status'
    };
    console.error('❌ OpenAI API error:', error.message);
  }

  // Test 3: Copilot Service
  try {
    if (diagnostics.tests.neo4j.status === 'connected' && 
        diagnostics.tests.openai.status === 'connected') {
      console.log('🔍 Testing Copilot service...');
      const { getCopilotService } = await import('@/lib/copilot');
      const copilot = getCopilotService();
      
      // Get service status
      const status = copilot.getStatus();
      diagnostics.tests.copilot.details = {
        initialized: status.initialized,
        initError: status.error
      };
      
      if (status.initialized && !status.error) {
        const isHealthy = await copilot.isHealthy();
        
        if (isHealthy) {
          diagnostics.tests.copilot.status = 'healthy';
          console.log('✅ Copilot service test passed');
          
          // Test a simple query
          try {
            const testResponse = await copilot.processQuestion('What is email security?');
            diagnostics.tests.copilot.details = {
              ...diagnostics.tests.copilot.details,
              queryTest: {
                success: true,
                responseLength: testResponse.response?.length || 0,
                confidence: testResponse.confidence
              }
            };
          } catch (queryError: any) {
            diagnostics.tests.copilot.details = {
              ...diagnostics.tests.copilot.details,
              queryTest: {
                success: false,
                error: queryError.message
              }
            };
          }
        } else {
          diagnostics.tests.copilot.status = 'unhealthy';
          diagnostics.tests.copilot.error = 'Health check returned false';
          console.log('❌ Copilot service unhealthy');
        }
      } else {
        diagnostics.tests.copilot.status = 'not_initialized';
        diagnostics.tests.copilot.error = status.error || 'Service not initialized';
        console.log('❌ Copilot service not initialized');
      }
    } else {
      diagnostics.tests.copilot.status = 'skipped';
      diagnostics.tests.copilot.error = 'Dependencies not available';
      diagnostics.tests.copilot.details = {
        issue: 'Neo4j or OpenAI not working',
        solution: 'Fix Neo4j and OpenAI issues first'
      };
      console.log('⏭️ Skipping copilot test due to dependencies');
    }
  } catch (error: any) {
    diagnostics.tests.copilot.status = 'error';
    diagnostics.tests.copilot.error = error.message;
    diagnostics.tests.copilot.details = {
      issue: 'Service initialization failed',
      solution: 'Check logs for detailed error information'
    };
    console.error('❌ Copilot service error:', error.message);
  }

  // Overall status
  const allHealthy = 
    diagnostics.tests.neo4j.status === 'connected' &&
    diagnostics.tests.openai.status === 'connected' &&
    diagnostics.tests.copilot.status === 'healthy';

  const hasIssues = Object.values(diagnostics.tests).some(
    test => test.status === 'error' || test.status === 'failed'
  );

  return NextResponse.json({
    ...diagnostics,
    overall: {
      healthy: allHealthy,
      status: allHealthy ? '✅ All systems operational' : hasIssues ? '❌ Issues detected' : '⚠️ Partial functionality',
      recommendations: generateRecommendations(diagnostics),
      nextSteps: generateNextSteps(diagnostics)
    }
  });
}

function generateRecommendations(diagnostics: any): string[] {
  const recommendations: string[] = [];

  // Neo4j recommendations
  const neo4jTest = diagnostics.tests.neo4j;
  if (neo4jTest.status !== 'connected') {
    if (diagnostics.environment.neo4j.uri.includes('Not set')) {
      recommendations.push('Set NEO4J_URI environment variable (e.g., bolt://localhost:7687)');
    }
    if (diagnostics.environment.neo4j.password === 'Not set') {
      recommendations.push('Set NEO4J_PASSWORD environment variable');
    }
    
    if (neo4jTest.error?.includes('ECONNREFUSED')) {
      recommendations.push('Start Neo4j: `neo4j start` or check Neo4j Desktop');
      recommendations.push('Verify Neo4j is listening on port 7687: `netstat -an | grep 7687`');
    }
    
    if (neo4jTest.error?.includes('authentication')) {
      recommendations.push('Reset Neo4j password: `cypher-shell` then `ALTER USER neo4j SET PASSWORD \'Qwe!1234\'`');
    }
    
    recommendations.push('Test connection manually at http://localhost:7474');
  } else if (neo4jTest.details?.nodeCount === 0) {
    recommendations.push('Neo4j is connected but empty - consider loading test data');
  }

  // OpenAI recommendations
  const openaiTest = diagnostics.tests.openai;
  if (openaiTest.status !== 'connected') {
    if (diagnostics.environment.openai.apiKey === 'Not set - REQUIRED') {
      recommendations.push('Set OPENAI_API_KEY environment variable from https://platform.openai.com/');
    } else if (openaiTest.error?.includes('401')) {
      recommendations.push('Verify OPENAI_API_KEY is valid and account has sufficient credits');
    } else if (openaiTest.error?.includes('429')) {
      recommendations.push('Check OpenAI usage limits and billing at https://platform.openai.com/usage');
    }
  }

  // Environment variable mismatch
  if (diagnostics.environment.neo4j.encrypted === 'true' && 
      neo4jTest.status !== 'connected') {
    recommendations.push('For local Neo4j, set NEO4J_ENCRYPTED=false in your environment');
  }

  // Copilot recommendations
  const copilotTest = diagnostics.tests.copilot;
  if (copilotTest.status === 'error' || copilotTest.status === 'not_initialized') {
    recommendations.push('Restart your development server after fixing environment variables');
  }

  // General recommendations
  if (recommendations.length === 0 && !diagnostics.overall?.healthy) {
    recommendations.push('All basic checks passed - try reinitializing the copilot service');
    recommendations.push('Check application logs for additional error details');
  }

  return recommendations;
}

function generateNextSteps(diagnostics: any): string[] {
  const steps: string[] = [];
  
  const neo4jWorking = diagnostics.tests.neo4j.status === 'connected';
  const openaiWorking = diagnostics.tests.openai.status === 'connected';
  const copilotWorking = diagnostics.tests.copilot.status === 'healthy';

  if (!neo4jWorking) {
    steps.push('1. Fix Neo4j connection first');
    steps.push('   - Start Neo4j if not running');
    steps.push('   - Check environment variables');
    steps.push('   - Test at http://localhost:7474');
  }

  if (!openaiWorking) {
    steps.push('2. Configure OpenAI API');
    steps.push('   - Get API key from https://platform.openai.com/');
    steps.push('   - Set OPENAI_API_KEY environment variable');
    steps.push('   - Ensure account has credits');
  }

  if (neo4jWorking && openaiWorking && !copilotWorking) {
    steps.push('3. Debug copilot service initialization');
    steps.push('   - Check server logs for detailed errors');
    steps.push('   - Restart development server');
    steps.push('   - Try manual test in copilot UI');
  }

  if (neo4jWorking && openaiWorking && copilotWorking) {
    steps.push('✅ All systems working! Try using the copilot now');
    steps.push('   - Go to an email investigation page');
    steps.push('   - Click on the AI Copilot tab');
    steps.push('   - Ask a test question');
  }

  return steps;
}