/**
 * AWS SDK Configuration with Auto-Refresh Credentials
 * Uses AWS SDK v3 default provider chain: Instance Profile → Environment → SSO
 * Automatically refreshes expired credentials
 */

import { fromNodeProviderChain } from "@aws-sdk/credential-providers"
import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider"
import { WorkMailClient } from "@aws-sdk/client-workmail"
import { SESClient } from "@aws-sdk/client-ses"

// Get AWS credentials - use explicit credentials if available (for local dev)
const AWS_ACCESS_KEY_ID = process.env.ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID
const AWS_SECRET_ACCESS_KEY = process.env.SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY

let credentials
if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
  console.log('[AWS] Using explicit AWS credentials from environment variables')
  credentials = {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  }
} else {
  console.log('[AWS] Using AWS credential provider chain (default)')
  try {
    credentials = fromNodeProviderChain({
      // Timeout for credential provider calls
      timeout: 5000,
    })
  } catch (error) {
    console.error('[AWS] Failed to initialize credential provider chain:', error)
    throw new Error('AWS credentials not configured. Please set ACCESS_KEY_ID and SECRET_ACCESS_KEY environment variables, or ensure IAM role is properly configured.')
  }
}

const region = process.env.AWS_REGION || process.env.REGION || "us-east-1"

// Log credential configuration status
console.log('[AWS] Configuration:', {
  region,
  credentialSource: AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY ? 'environment_variables' : 'provider_chain',
  hasAccessKey: !!AWS_ACCESS_KEY_ID,
  hasSecretKey: !!AWS_SECRET_ACCESS_KEY,
})

// Create AWS service clients with credentials
export const ddb = new DynamoDBClient({ 
  region, 
  credentials,
  // Add retry configuration for better reliability
  maxAttempts: 3,
})

// Optional: Test credentials on first use (lazy validation)
let credentialsTested = false
export async function validateCredentials(): Promise<boolean> {
  if (credentialsTested) return true
  
  try {
    // Try a simple DynamoDB operation to validate credentials
    const { ListTablesCommand } = await import('@aws-sdk/client-dynamodb')
    await ddb.send(new ListTablesCommand({ Limit: 1 }))
    credentialsTested = true
    console.log('[AWS] Credentials validated successfully')
    return true
  } catch (error: any) {
    console.error('[AWS] Credential validation failed:', error.message)
    return false
  }
}

export const cognitoClient = new CognitoIdentityProviderClient({ 
  region, 
  credentials: credentials as any,
  maxAttempts: 3,
})

export const workMailClient = new WorkMailClient({ 
  region, 
  credentials: credentials as any,
  maxAttempts: 3,
})

export const sesClient = new SESClient({ 
  region, 
  credentials: credentials as any,
  maxAttempts: 3,
})

// Helper function to handle AWS errors consistently
export function handleAwsError(error: any, context: string = "") {
  console.error(`AWS Error ${context}:`, error)
  
  // Handle specific AWS error types
  if (error.name === "ExpiredTokenException" || error.name === "UnrecognizedClientException") {
    return {
      statusCode: 401,
      error: "AWS_CREDENTIALS_EXPIRED",
      message: "AWS credentials have expired or are invalid. Please contact support."
    }
  }
  
  // Handle invalid security token error
  if (error.message?.includes("security token") && error.message?.includes("invalid")) {
    return {
      statusCode: 401,
      error: "AWS_ERROR",
      message: "The security token included in the request is invalid.",
      troubleshooting: [
        "Check AWS credentials are valid and not expired",
        "Verify IAM permissions for DynamoDB access",
        "Ensure ACCESS_KEY_ID and SECRET_ACCESS_KEY environment variables are set correctly",
        "If using IAM roles, verify the role has proper DynamoDB permissions",
        "Check if credentials need to be refreshed"
      ]
    }
  }
  
  if (error.name === "AccessDeniedException" || error.name === "UnauthorizedOperation") {
    return {
      statusCode: 403,
      error: "AWS_ACCESS_DENIED",
      message: "Insufficient AWS permissions for this operation."
    }
  }
  
  if (error.name === "ResourceNotFoundException") {
    return {
      statusCode: 404,
      error: "AWS_RESOURCE_NOT_FOUND",
      message: "The requested AWS resource was not found."
    }
  }
  
  // Check for credential-related errors in the message
  if (error.message?.includes("credentials") || error.message?.includes("token")) {
    return {
      statusCode: 401,
      error: "AWS_ERROR",
      message: error.message || "AWS credentials error occurred.",
      troubleshooting: [
        "Check AWS credentials are valid and not expired",
        "Verify IAM permissions for DynamoDB access",
        "Ensure ACCESS_KEY_ID and SECRET_ACCESS_KEY environment variables are set correctly",
        "If using IAM roles, verify the role has proper DynamoDB permissions"
      ]
    }
  }
  
  // Generic AWS error
  return {
    statusCode: 500,
    error: "AWS_ERROR",
    message: error.message || "An AWS service error occurred."
  }
}

// Helper to extract organization ID from various sources
export function extractOrgId(request: Request, fallback?: string): string | null {
  try {
    // 1. Check x-org-id header (preferred)
    const headerOrgId = request.headers.get('x-org-id')
    if (headerOrgId) return headerOrgId
    
    // 2. Check URL query parameter
    const url = new URL(request.url)
    const queryOrgId = url.searchParams.get('orgId')
    if (queryOrgId) return queryOrgId
    
    // 3. Extract from URL path /o/{orgId}/...
    const pathMatch = url.pathname.match(/\/o\/([^/]+)\//)
    if (pathMatch) return pathMatch[1]
    
    // 4. Check referer header for org context
    const referer = request.headers.get('referer')
    if (referer) {
      const refererMatch = referer.match(/\/o\/([^/]+)\//)
      if (refererMatch) return refererMatch[1]
    }
    
    // 5. Use fallback if provided (avoid this in new code)
    if (fallback) {
      console.warn(`Using fallback orgId: ${fallback}`)
      return fallback
    }
    
    return null
  } catch (error) {
    console.error('Error extracting orgId:', error)
    return fallback || null
  }
}

// Export table names with proper fallbacks
export const TABLES = {
  ORGANIZATIONS: process.env.ORGANIZATIONS_TABLE_NAME || "Organizations",
  USERS: process.env.USERS_TABLE_NAME || "SecurityTeamUsers", 
  CLOUDSERVICES: process.env.CLOUDSERVICES_TABLE_NAME || "CloudServices",
  EMAILS: process.env.EMAILS_TABLE_NAME || "Emails",
  DETECTIONS: process.env.DETECTIONS_TABLE_NAME || "Detections",
  ENDPOINTS: process.env.ENDPOINTS_TABLE_NAME || "Endpoints",
  ENDPOINT_EVENTS: process.env.ENDPOINT_EVENTS_TABLE_NAME || "EndpointEvents",
} as const
