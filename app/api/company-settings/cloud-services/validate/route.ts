// app/api/company-settings/cloud-services/validate/route.ts

export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  DescribeUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  WorkMailClient,
  DescribeOrganizationCommand,
  ListUsersCommand
} from "@aws-sdk/client-workmail";

const VALID_AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'af-south-1', 'ap-east-1', 'ap-south-1', 'ap-northeast-1',
  'ap-northeast-2', 'ap-northeast-3', 'ap-southeast-1',
  'ap-southeast-2', 'ca-central-1', 'eu-central-1',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-south-1',
  'eu-north-1', 'me-south-1', 'sa-east-1'
];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { serviceType } = body;
    
    console.log('🔍 Validation request for service type:', serviceType);
    
    if (serviceType === 'aws-cognito') {
      return await validateCognito(body);
    } else if (serviceType === 'aws-workmail') {
      return await validateWorkMail(body);
    } else {
      return NextResponse.json(
        { 
          valid: false,
          error: "Invalid service type",
          message: "Service type must be either 'aws-cognito' or 'aws-workmail'" 
        },
        { status: 400 }
      );
    }
  } catch (err: any) {
    console.error("❌ Validation function error:", {
      name: err.name,
      message: err.message,
      stack: err.stack
    });
    
    return NextResponse.json(
      { 
        valid: false, 
        error: "Internal server error",
        message: err.message,
      },
      { status: 500 }
    );
  }
}

async function validateCognito(body: any) {
  const { userPoolId, clientId, clientSecret, region } = body;
  
  console.log('🔍 Cognito validation request:', { 
    userPoolId, 
    clientId, 
    hasClientSecret: !!clientSecret, 
    region 
  });
  
  // Input validation
  if (!userPoolId || !clientId || !region) {
    return NextResponse.json(
      { 
        valid: false,
        error: "Missing required fields",
        message: "User Pool ID, Client ID and Region are all required" 
      },
      { status: 400 }
    );
  }
  
  // Validate region format
  if (!VALID_AWS_REGIONS.includes(region)) {
    return NextResponse.json(
      { 
        valid: false,
        error: "Invalid region format",
        message: `"${region}" is not a valid AWS region. Please use a standard AWS region code like "us-east-1".`
      },
      { status: 400 }
    );
  }
  
  // Validate User Pool ID format
  if (!userPoolId.includes('_')) {
    return NextResponse.json(
      { 
        valid: false,
        error: "Invalid User Pool ID format",
        message: "User Pool ID should be in the format 'region_identifier', e.g. 'us-east-1_abcdefghi'"
      },
      { status: 400 }
    );
  }
  
  const userPoolRegionPrefix = userPoolId.split('_')[0];
  if (!VALID_AWS_REGIONS.includes(userPoolRegionPrefix)) {
    return NextResponse.json(
      { 
        valid: false,
        error: "Invalid User Pool ID format",
        message: "User Pool ID should be in the format 'region_identifier', e.g. 'us-east-1_abcdefghi'"
      },
      { status: 400 }
    );
  }
  
  // If the region in the User Pool ID doesn't match the provided region
  if (userPoolRegionPrefix !== region) {
    return NextResponse.json(
      { 
        valid: false,
        error: "Region mismatch",
        message: `The region in your User Pool ID (${userPoolRegionPrefix}) doesn't match the provided region (${region}). They must be the same.`
      },
      { status: 400 }
    );
  }
  
  // Create a Cognito client using the validated region
  const cognito = new CognitoIdentityProviderClient({
    region,
  });
  
  try {
    // Test 1: Validate User Pool exists
    console.log('🚀 Testing User Pool access...');
    const userPoolResult = await cognito.send(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId })
    );
    console.log('✅ User Pool found:', userPoolResult.UserPool?.Name);
    
    // Test 2: Validate App Client exists and get its configuration
    console.log('🚀 Testing App Client access...');
    const clientResult = await cognito.send(
      new DescribeUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: clientId
      })
    );
    
    const clientConfig = clientResult.UserPoolClient;
    console.log('✅ App Client found:', {
      clientName: clientConfig?.ClientName,
      hasClientSecret: !!clientConfig?.ClientSecret
    });
    
    // Test 3: Check if client secret is required and matches
    if (clientConfig?.ClientSecret) {
      if (!clientSecret) {
        return NextResponse.json(
          { 
            valid: false,
            error: "Client secret required",
            message: "This app client requires a client secret. Please provide the client secret."
          },
          { status: 400 }
        );
      }
      console.log('✅ Client secret provided for secret-enabled client');
    } else {
      console.log('ℹ️ App client does not use client secret');
    }
    
    return NextResponse.json({
      valid: true,
      message: "AWS Cognito credentials are valid",
      userPoolName: userPoolResult.UserPool?.Name,
      clientName: clientConfig?.ClientName,
      requiresSecret: !!clientConfig?.ClientSecret
    });
    
  } catch (err: any) {
    console.error("❌ Cognito API validation error:", {
      name: err.name,
      message: err.message,
      code: err.code,
      statusCode: err.$metadata?.httpStatusCode
    });
    
    let errorMessage = "Failed to validate AWS Cognito credentials";
    
    if (err.name === "UserPoolNotFoundException") {
      errorMessage = "User Pool not found. Please check the User Pool ID.";
    } else if (err.name === "ResourceNotFoundException") {
      if (err.message?.includes("client")) {
        errorMessage = "App Client not found. Please check the Client ID.";
      } else {
        errorMessage = "User Pool not found. Please check the User Pool ID.";
      }
    } else if (err.name === "InvalidParameterException") {
      errorMessage = "Invalid parameters. Please check your inputs.";
    } else if (err.message?.includes("not authorized") || err.name === "AccessDeniedException") {
      errorMessage = "Access denied. Please ensure your Lambda execution role has the required Cognito permissions.";
    }
    
    return NextResponse.json(
      { 
        valid: false, 
        error: errorMessage,
        message: err.message,
        code: err.code || err.name,
        troubleshooting: "Ensure your Lambda role has cognito-idp:DescribeUserPool and cognito-idp:DescribeUserPoolClient permissions"
      },
      { status: 400 }
    );
  }
}

async function validateWorkMail(body: any) {
  const { organizationId, region, alias } = body;
  
  console.log('🔍 WorkMail validation request:', { 
    organizationId, 
    region,
    alias 
  });
  
  // Input validation
  if (!organizationId || !region) {
    return NextResponse.json(
      { 
        valid: false,
        error: "Missing required fields",
        message: "Organization ID and Region are required" 
      },
      { status: 400 }
    );
  }
  
  // Validate region format
  if (!VALID_AWS_REGIONS.includes(region)) {
    return NextResponse.json(
      { 
        valid: false,
        error: "Invalid region format",
        message: `"${region}" is not a valid AWS region. Please use a standard AWS region code like "us-east-1".`
      },
      { status: 400 }
    );
  }
  
  // Validate Organization ID format
  if (!organizationId.startsWith('m-')) {
    return NextResponse.json(
      { 
        valid: false,
        error: "Invalid Organization ID format",
        message: "WorkMail Organization ID should start with 'm-'"
      },
      { status: 400 }
    );
  }
  
  // Create a WorkMail client using the validated region
  const workmail = new WorkMailClient({
    region,
  });
  
  try {
    // Test 1: Validate Organization exists
    console.log('🚀 Testing WorkMail Organization access...');
    const orgResult = await workmail.send(
      new DescribeOrganizationCommand({ OrganizationId: organizationId })
    );
    console.log('✅ WorkMail Organization found:', orgResult.OrganizationId);
    
    // Test 2: Try to list users to verify permissions
    console.log('🚀 Testing WorkMail permissions...');
    const usersResult = await workmail.send(
      new ListUsersCommand({
        OrganizationId: organizationId,
        MaxResults: 1 // Just test with 1 user
      })
    );
    console.log('✅ WorkMail permissions verified, found users:', usersResult.Users?.length || 0);
    
    return NextResponse.json({
      valid: true,
      message: "AWS WorkMail credentials are valid",
      organizationId: orgResult.OrganizationId,
      organizationAlias: orgResult.Alias,
      organizationState: orgResult.State,
      userCount: usersResult.Users?.length || 0
    });
    
  } catch (err: any) {
    console.error("❌ WorkMail API validation error:", {
      name: err.name,
      message: err.message,
      code: err.code,
      statusCode: err.$metadata?.httpStatusCode
    });
    
    let errorMessage = "Failed to validate AWS WorkMail credentials";
    
    if (err.name === "OrganizationNotFoundException") {
      errorMessage = "WorkMail Organization not found. Please check the Organization ID.";
    } else if (err.name === "ResourceNotFoundException") {
      errorMessage = "WorkMail Organization not found. Please check the Organization ID.";
    } else if (err.name === "InvalidParameterException") {
      errorMessage = "Invalid parameters. Please check your inputs.";
    } else if (err.message?.includes("not authorized") || err.name === "AccessDeniedException") {
      errorMessage = "Access denied. Please ensure your Lambda execution role has the required WorkMail permissions.";
    }
    
    return NextResponse.json(
      { 
        valid: false, 
        error: errorMessage,
        message: err.message,
        code: err.code || err.name,
        troubleshooting: "Ensure your Lambda role has workmail:DescribeOrganization and workmail:ListUsers permissions"
      },
      { status: 400 }
    );
  }
}