// app/api/copilot-test/route.ts - Updated to use Parameter Store
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getOpenAIApiKey, validateOpenAIKey, getConfig, getNeo4jConfig } from '@/lib/config';

export async function GET() {
  const config = getConfig();
  
  // Load Neo4j config separately since it's now from Parameter Store
  let neo4jConfig;
  try {
    neo4jConfig = await getNeo4jConfig();
  } catch (error: any) {
    neo4jConfig = {
      uri: 'Error loading from Parameter Store',
      user: 'Error loading from Parameter Store',
      password: null,
      encrypted: false
    };
  }
  
  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: {
      neo4j: {
        uri: neo4jConfig.uri,
        user: neo4jConfig.user,
        password: neo4jConfig.password ? '***SET***' : 'Not set',
        encrypted: neo4jConfig.encrypted.toString(),
      },
      openai: {
        apiKey: 'Loading...',
        model: config.openai.model,
        source: 'Unknown'
      },
      aws: {
        region: config.aws.region,
        parameterStore: 'Unknown'
      }
    },
    tests: {
      neo4j: { status: 'unknown', error: null as string | null, details: {} },
      openai: { status: 'unknown', error: null as string | null, details: {} },
      copilot: { status: 'unknown', error: null as string | null, details: {} },
      parameterStore: { status: 'unknown', error: null as string | null, details: {} }
    }
  };

  console.log('🧪 Starting comprehensive diagnostic tests...');

  // Test 1: Parameter Store Access
  try {
    console.log('🔍 Testing AWS Parameter Store access...');
    
    // Test if we can access Parameter Store
    const { SSMClient, GetParameterCommand } = await import('@aws-sdk/client-ssm');
    const ssmClient = new SSMClient({ region: config.aws.region });
    
    const command = new GetParameterCommand({
      Name: 'encryptgate-openai-key',
      WithDecryption: false // Don't decrypt for the test, just check access
    });
    
    const response = await ssmClient.send(command);
    
    diagnostics.tests.parameterStore.status = 'accessible';
    diagnostics.tests.parameterStore.details = {
      parameterExists: !!response.Parameter,
      parameterName: 'encryptgate-openai-key',
      region: config.aws.region
    };
    diagnostics.environment.aws.parameterStore = 'Accessible';
    
    console.log('✅ Parameter Store accessible');
    
  } catch (parameterError: any) {
    diagnostics.tests.parameterStore.status = 'failed';
    diagnostics.tests.parameterStore.error = parameterError.message;
    diagnostics.environment.aws.parameterStore = 'Not accessible';
    
    console.error('❌ Parameter Store test failed:', parameterError.message);
    
    if (parameterError.name === 'ParameterNotFound') {
      diagnostics.tests.parameterStore.details = {
        issue: 'Parameter not found',
        solution: 'Create parameter: aws ssm put-parameter --name "encryptgate-openai-key" --value "your-key" --type "SecureString"'
      };
    } else if (parameterError.name === 'AccessDenied') {
      diagnostics.tests.parameterStore.details = {
        issue: 'Access denied to Parameter Store',
        solution: 'Add SSM GetParameter permissions to your Lambda/Amplify execution role'
      };
    }
  }

  // Test 2: Neo4j Connection
  try {
    console.log('🔍 Testing Neo4j connection...');
    const { testNeo4jConnection, getDriver } = await import('@/lib/neo4j');
    const neo4jConnected = await testNeo4jConnection();
    
    if (neo4jConnected) {
      diagnostics.tests.neo4j.status = 'connected';
      
      // Test basic query
      try {
        const driver = await getDriver();
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
    
    // Provide specific error guidance
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

  // Test 3: OpenAI API Configuration
  try {
    console.log('🔍 Testing OpenAI API configuration...');
    
    let apiKey: string;
    let keySource: string;
    
    try {
      // Attempt to load the API key using our new system
      apiKey = await getOpenAIApiKey();
      
      // Determine the source
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
        keySource = 'Environment Variable';
      } else if (process.env.OPENAI_API_KEY_P1 && process.env.OPENAI_API_KEY_P2) {
        keySource = 'Split Environment Variables';
      } else {
        keySource = 'AWS Parameter Store';
      }
      
      console.log(`🔑 OpenAI key loaded from: ${keySource}`);
      
      // Update environment info
      diagnostics.environment.openai.apiKey = '***SET***';
      diagnostics.environment.openai.source = keySource;
      
    } catch (keyError: any) {
      diagnostics.tests.openai.status = 'no_key';
      diagnostics.tests.openai.error = keyError.message;
      diagnostics.environment.openai.apiKey = 'Not Found';
      diagnostics.environment.openai.source = 'None';
      
      console.log('❌ OpenAI API key not found:', keyError.message);
      
      // Don't continue with API test if no key
      diagnostics.tests.openai.details = {
        issue: 'API key not found',
        solution: keyError.message.includes('Parameter Store') 
          ? 'Create parameter in AWS Parameter Store'
          : 'Set OPENAI_API_KEY environment variable'
      };
      
      // Skip to final results
      return NextResponse.json({
        ...diagnostics,
        overall: generateOverallStatus(diagnostics)
      });
    }

    // Validate key format
    if (!validateOpenAIKey(apiKey)) {
      diagnostics.tests.openai.status = 'invalid_key';
      diagnostics.tests.openai.error = 'Invalid API key format';
      diagnostics.tests.openai.details = {
        keyLength: apiKey?.length || 0,
        keyPrefix: apiKey?.substring(0, 15) + '...' || 'N/A',
        keySource: keySource,
        issue: 'Key format validation failed',
        solution: 'Verify the complete API key was stored correctly'
      };
      
      console.log('❌ Invalid OpenAI API key format');
    } else {
      // Test actual API call
      console.log('🤖 Testing OpenAI API call...');
      
      try {
        const testResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.openai.model,
            messages: [{ role: 'user', content: 'Test connection - respond with OK' }],
            max_tokens: 5,
          }),
        });

        if (testResponse.ok) {
          const data = await testResponse.json();
          const responseText = data.choices?.[0]?.message?.content || '';
          
          diagnostics.tests.openai.status = 'connected';
          diagnostics.tests.openai.details = {
            model: config.openai.model,
            responseReceived: !!responseText,
            keySource: keySource,
            keyLength: apiKey.length,
            keyPrefix: apiKey.substring(0, 15) + '...',
            actualResponse: responseText
          };
          
          console.log('✅ OpenAI API test passed');
        } else {
          const errorData = await testResponse.json().catch(() => ({}));
          diagnostics.tests.openai.status = 'failed';
          diagnostics.tests.openai.error = `HTTP ${testResponse.status}: ${errorData.error?.message || testResponse.statusText}`;
          
          // Log detailed error info
          console.error('🚨 OpenAI API Error:', {
            status: testResponse.status,
            error: errorData,
            keyLength: apiKey.length,
            keyPrefix: apiKey.substring(0, 15) + '...',
            keySource: keySource
          });
          
          diagnostics.tests.openai.details = {
            keyLength: apiKey.length,
            keyPrefix: apiKey.substring(0, 15) + '...',
            keySource: keySource,
            httpStatus: testResponse.status,
            actualError: errorData.error?.message
          };
          
          if (testResponse.status === 401) {
            diagnostics.tests.openai.details = {
              ...diagnostics.tests.openai.details,
              issue: 'Authentication failed',
              solution: 'Verify API key is valid and account has sufficient credits'
            };
          } else if (testResponse.status === 429) {
            diagnostics.tests.openai.details = {
              ...diagnostics.tests.openai.details,
              issue: 'Rate limit or quota exceeded',
              solution: 'Check OpenAI usage and billing'
            };
          }
        }
      } catch (apiError: any) {
        diagnostics.tests.openai.status = 'error';
        diagnostics.tests.openai.error = apiError.message;
        diagnostics.tests.openai.details = {
          keySource: keySource,
          networkError: apiError.message,
          issue: 'Network or API error',
          solution: 'Check internet connection and OpenAI service status'
        };
        
        console.error('❌ OpenAI API call failed:', apiError.message);
      }
    }
  } catch (error: any) {
    diagnostics.tests.openai.status = 'error';
    diagnostics.tests.openai.error = error.message;
    console.error('❌ OpenAI configuration error:', error.message);
  }

  // Test 4: Copilot Service
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

  return NextResponse.json({
    ...diagnostics,
    overall: generateOverallStatus(diagnostics)
  });
}

function generateOverallStatus(diagnostics: any) {
  const allHealthy = 
    diagnostics.tests.neo4j.status === 'connected' &&
    diagnostics.tests.openai.status === 'connected' &&
    diagnostics.tests.copilot.status === 'healthy';

  const hasIssues = Object.values(diagnostics.tests).some(
    (test: any) => test.status === 'error' || test.status === 'failed'
  );

  const recommendations = generateRecommendations(diagnostics);
  const nextSteps = generateNextSteps(diagnostics);

  return {
    healthy: allHealthy,
    status: allHealthy ? '✅ All systems operational' : hasIssues ? '❌ Issues detected' : '⚠️ Partial functionality',
    recommendations,
    nextSteps,
    configurationSummary: {
      neo4jWorking: diagnostics.tests.neo4j.status === 'connected',
      openaiWorking: diagnostics.tests.openai.status === 'connected',
      parameterStoreWorking: diagnostics.tests.parameterStore.status === 'accessible',
      copilotWorking: diagnostics.tests.copilot.status === 'healthy',
      keySource: diagnostics.environment.openai.source
    }
  };
}

function generateRecommendations(diagnostics: any): string[] {
  const recommendations: string[] = [];

  // Parameter Store recommendations
  const parameterTest = diagnostics.tests.parameterStore;
  if (parameterTest.status !== 'accessible') {
    if (parameterTest.error?.includes('ParameterNotFound')) {
      recommendations.push('Create OpenAI API key parameter: aws ssm put-parameter --name "encryptgate-openai-key" --value "your-key" --type "SecureString"');
    } else if (parameterTest.error?.includes('AccessDenied')) {
      recommendations.push('Add SSM permissions to your Lambda/Amplify execution role');
      recommendations.push('Required permission: ssm:GetParameter for arn:aws:ssm:*:*:parameter/encryptgate-*');
    }
  }

  // OpenAI recommendations
  const openaiTest = diagnostics.tests.openai;
  if (openaiTest.status !== 'connected') {
    if (openaiTest.status === 'no_key') {
      recommendations.push('Store your OpenAI API key in Parameter Store or set as environment variable');
    } else if (openaiTest.status === 'invalid_key') {
      recommendations.push('Verify your API key is complete and not truncated');
      recommendations.push('Check that the key starts with "sk-" and is the full length');
    } else if (openaiTest.error?.includes('401')) {
      recommendations.push('Verify your OpenAI API key is valid at https://platform.openai.com/api-keys');
      recommendations.push('Check that your OpenAI account has sufficient credits');
    } else if (openaiTest.error?.includes('429')) {
      recommendations.push('Check OpenAI usage limits and billing at https://platform.openai.com/usage');
    }
  }

  // Neo4j recommendations
  const neo4jTest = diagnostics.tests.neo4j;
  if (neo4jTest.status !== 'connected') {
    if (neo4jTest.error?.includes('ECONNREFUSED')) {
      recommendations.push('Start Neo4j: `neo4j start` or check Neo4j Desktop');
      recommendations.push('Verify Neo4j is listening on port 7687');
    } else if (neo4jTest.error?.includes('authentication')) {
      recommendations.push('Check Neo4j password in environment variables');
      recommendations.push('Reset Neo4j password if needed: `cypher-shell` then `ALTER USER neo4j SET PASSWORD \'Qwe!1234\'`');
    }
    
    recommendations.push('Test connection manually at http://localhost:7474');
  } else if (neo4jTest.details?.nodeCount === 0) {
    recommendations.push('Neo4j is connected but empty - consider loading test data');
  }

  return recommendations;
}

function generateNextSteps(diagnostics: any): string[] {
  const steps: string[] = [];
  
  const parameterStoreWorking = diagnostics.tests.parameterStore.status === 'accessible';
  const neo4jWorking = diagnostics.tests.neo4j.status === 'connected';
  const openaiWorking = diagnostics.tests.openai.status === 'connected';
  const copilotWorking = diagnostics.tests.copilot.status === 'healthy';

  if (!parameterStoreWorking) {
    steps.push('1. Fix AWS Parameter Store access');
    steps.push('   - Create the parameter: aws ssm put-parameter --name "encryptgate-openai-key" --value "your-api-key" --type "SecureString"');
    steps.push('   - Add SSM permissions to your execution role');
    steps.push('   - Test with: aws ssm get-parameter --name "encryptgate-openai-key" --with-decryption');
  }

  if (!neo4jWorking) {
    steps.push('2. Fix Neo4j connection');
    steps.push('   - Start Neo4j if not running');
    steps.push('   - Check environment variables');
    steps.push('   - Test at http://localhost:7474');
  }

  if (!openaiWorking && parameterStoreWorking) {
    steps.push('3. Fix OpenAI API configuration');
    steps.push('   - Verify API key is valid');
    steps.push('   - Check account has credits');
    steps.push('   - Test key manually with curl');
  }

  if (parameterStoreWorking && neo4jWorking && openaiWorking && !copilotWorking) {
    steps.push('4. Debug copilot service initialization');
    steps.push('   - Check server logs for detailed errors');
    steps.push('   - Restart development server');
    steps.push('   - Try manual test in copilot UI');
  }

  if (parameterStoreWorking && neo4jWorking && openaiWorking && copilotWorking) {
    steps.push('✅ All systems working! Try using the copilot now');
    steps.push('   - Go to an email investigation page');
    steps.push('   - Click on the AI Copilot tab');
    steps.push('   - Ask a test question');
  }

  return steps;
}