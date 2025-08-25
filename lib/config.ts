// lib/config.ts - Dynamic configuration loading
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

// Cache for configuration to avoid repeated AWS calls
let cachedOpenAIKey: string | null = null;
let cachedNeo4jConfig: Neo4jConfig | null = null;
let keyFetchTime: number = 0;
let neo4jFetchTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

interface Neo4jConfig {
  uri: string;
  user: string;
  password: string;
  encrypted: boolean;
}

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
 * Get Neo4j configuration from Parameter Store or environment variables
 */
export async function getNeo4jConfig(): Promise<Neo4jConfig> {
  // Check cache first
  if (cachedNeo4jConfig && Date.now() - neo4jFetchTime < CACHE_TTL) {
    console.log('🔑 Using cached Neo4j config');
    return cachedNeo4jConfig;
  }

  try {
    // Try environment variables first (for local development)
    if (process.env.NEO4J_URI && process.env.NEO4J_USER && process.env.NEO4J_PASSWORD) {
      console.log('🔑 Using Neo4j config from environment variables');
      const config = {
        uri: process.env.NEO4J_URI,
        user: process.env.NEO4J_USER,
        password: process.env.NEO4J_PASSWORD,
        encrypted: process.env.NEO4J_ENCRYPTED === 'true'
      };
      
      cachedNeo4jConfig = config;
      neo4jFetchTime = Date.now();
      return config;
    }

    // Fetch from Parameter Store
    console.log('🔑 Fetching Neo4j config from AWS Parameter Store...');
    
    const uriCommand = new GetParameterCommand({
      Name: 'encryptgate-neo4j-uri',
      WithDecryption: false
    });
    
    const userCommand = new GetParameterCommand({
      Name: 'encryptgate-neo4j-user',
      WithDecryption: false
    });
    
    const passwordCommand = new GetParameterCommand({
      Name: 'encryptgate-neo4j-password',
      WithDecryption: true
    });

    const [uriResponse, userResponse, passwordResponse] = await Promise.all([
      ssmClient.send(uriCommand),
      ssmClient.send(userCommand),
      ssmClient.send(passwordCommand)
    ]);

    if (!uriResponse.Parameter?.Value || !userResponse.Parameter?.Value || !passwordResponse.Parameter?.Value) {
      throw new Error('One or more Neo4j parameters not found in Parameter Store');
    }

    const config = {
      uri: uriResponse.Parameter.Value,
      user: userResponse.Parameter.Value,
      password: passwordResponse.Parameter.Value,
      encrypted: false // Default to false for most EC2 setups
    };

    cachedNeo4jConfig = config;
    neo4jFetchTime = Date.now();
    
    console.log('✅ Neo4j config successfully loaded from Parameter Store');
    console.log(`🔍 URI: ${config.uri}`);
    console.log(`🔍 User: ${config.user}`);
    
    return config;

  } catch (error: any) {
    console.error('❌ Failed to get Neo4j config:', error);
    
    if (error.name === 'ParameterNotFound') {
      throw new Error('Neo4j parameters not found in Parameter Store. Please create parameters: encryptgate-neo4j-uri, encryptgate-neo4j-user, encryptgate-neo4j-password');
    } else if (error.name === 'AccessDenied') {
      throw new Error('Access denied to Parameter Store. Check IAM permissions for SSM GetParameter');
    } else {
      throw new Error(`Failed to load Neo4j config: ${error.message}`);
    }
  }
}

/**
 * Get other configuration values
 */
export function getConfig() {
  return {
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

/**
 * Clear the cached Neo4j config (useful for error recovery)
 */
export function clearNeo4jConfigCache(): void {
  cachedNeo4jConfig = null;
  neo4jFetchTime = 0;
  console.log('🗑️ Neo4j config cache cleared');
}

/**
 * Clear all cached configuration
 */
export function clearAllCache(): void {
  clearApiKeyCache();
  clearNeo4jConfigCache();
  console.log('🗑️ All configuration cache cleared');
}