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

// Use AWS SDK default provider chain with auto-refresh
const credentials = fromNodeProviderChain({
  // Timeout for credential provider calls
  timeout: 5000,
})

const region = process.env.AWS_REGION || "us-east-1"

// Create AWS service clients with auto-refreshing credentials
export const ddb = new DynamoDBClient({ 
  region, 
  credentials,
  // Add retry configuration for better reliability
  maxAttempts: 3,
})

export const cognitoClient = new CognitoIdentityProviderClient({ 
  region, 
  credentials,
  maxAttempts: 3,
})

export const workMailClient = new WorkMailClient({ 
  region, 
  credentials,
  maxAttempts: 3,
})

export const sesClient = new SESClient({ 
  region, 
  credentials,
  maxAttempts: 3,
})

// Helper function to handle AWS errors consistently
export function handleAwsError(error: any, context: string = "") {
  console.error(`AWS Error ${context}:`, error)
  
  // Handle specific AWS error types
  if (error.name === "ExpiredTokenException") {
    return {
      statusCode: 401,
      error: "AWS_CREDENTIALS_EXPIRED",
      message: "AWS credentials have expired. Please contact support."
    }
  }
  
  if (error.name === "AccessDeniedException") {
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
  DETECTIONS: process.env.DETECTIONS_TABLE_NAME || "Detections"
} as const