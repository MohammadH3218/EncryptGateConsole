// lib/config.ts - Dynamic configuration loading
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

// Cache for API keys to avoid repeated AWS calls
let cachedOpenAIKey: string | null = null;
let keyFetchTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

const ssmClient = new SSMClient({ 
  region: process.env.AWS_REGION || 'us-east-1' 
});

/**
 * Get OpenAI API key from Parameter Store or environment variable
 */
export async function getOpenAIApiKey(): Promise<string> {
  // Check cache first to avoid repeated AWS calls
  if (cachedOpenAIKey && Date.now() - keyFetchTime < CACHE_TTL) {
    console.log('🔑 Using cached OpenAI key');
    return cachedOpenAIKey ?? '';
  }

  try {
    // Try environment variable first (for local development)
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
      console.log('🔑 Using OpenAI key from environment variable');
      cachedOpenAIKey = process.env.OPENAI_API_KEY;
      keyFetchTime = Date.now();
      return cachedOpenAIKey ?? '';
    }

    // Check if we have split keys in environment (fallback option)
    if (process.env.OPENAI_API_KEY_P1 && process.env.OPENAI_API_KEY_P2) {
      console.log('🔑 Using OpenAI key from split environment variables');
      cachedOpenAIKey = process.env.OPENAI_API_KEY_P1 + process.env.OPENAI_API_KEY_P2;
      keyFetchTime = Date.now();
      return cachedOpenAIKey;
    }

    // Fetch from Parameter Store
    console.log('🔑 Fetching OpenAI key from AWS Parameter Store...');
    const command = new GetParameterCommand({
      Name: 'encryptgate-openai-key', // Match what you created
      WithDecryption: true
    });

    const response = await ssmClient.send(command);
    
    if (!response.Parameter?.Value) {
      throw new Error('Parameter not found in Parameter Store');
    }

    const key = response.Parameter.Value;
    
    // Validate the key before caching
    if (!validateOpenAIKey(key)) {
      throw new Error('Invalid API key format retrieved from Parameter Store');
    }

    cachedOpenAIKey = key;
    keyFetchTime = Date.now();
    
    console.log('✅ OpenAI key successfully loaded from Parameter Store');
    console.log(`🔍 Key length: ${key.length} characters`);
    console.log(`🔍 Key prefix: ${key.substring(0, 15)}...`);
    
    return cachedOpenAIKey;

  } catch (error: any) {
    console.error('❌ Failed to get OpenAI API key:', error);
    
    // Provide more specific error messages
    if (error.name === 'ParameterNotFound') {
      throw new Error('OpenAI API key not found in Parameter Store. Please create parameter "encryptgate-openai-key"');
    } else if (error.name === 'AccessDenied') {
      throw new Error('Access denied to Parameter Store. Check IAM permissions for SSM GetParameter');
    } else if (error.message?.includes('Invalid API key format')) {
      throw new Error(`Invalid API key format in Parameter Store: ${error.message}`);
    } else {
      throw new Error(`Failed to load OpenAI API key: ${error.message}`);
    }
  }
}

/**
 * Validate OpenAI API key format
 */
export function validateOpenAIKey(key: string): boolean {
  if (!key) {
    console.log('❌ API key is empty');
    return false;
  }
  
  if (!key.startsWith('sk-')) {
    console.log('❌ API key does not start with "sk-"');
    return false;
  }
  
  if (key.length < 50) {
    console.log('❌ API key is too short');
    return false;
  }
  
  // Check for common truncation issues
  if (key.includes('***') || key.includes('...')) {
    console.log('❌ API key appears to be masked or truncated');
    return false;
  }
  
  return true;
}

/**
 * Get other configuration values
 */
export function getConfig() {
  return {
    neo4j: {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      user: process.env.NEO4J_USER || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'Qwe!1234',
      encrypted: process.env.NEO4J_ENCRYPTED === 'true'
    },
    openai: {
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      url: 'https://api.openai.com/v1/chat/completions'
    },
    aws: {
      region: process.env.AWS_REGION || 'us-east-1'
    }
  };
}

/**
 * Clear the cached API key (useful for error recovery)
 */
export function clearApiKeyCache(): void {
  cachedOpenAIKey = null;
  keyFetchTime = 0;
  console.log('🗑️ OpenAI API key cache cleared');
}