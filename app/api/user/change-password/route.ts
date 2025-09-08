// app/api/user/change-password/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import {
  CognitoIdentityProviderClient,
  ChangePasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

// DynamoDB setup
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const CLOUDSERVICES_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || 'CloudServices';

// Get Cognito configuration for organization
async function getCognitoConfig(orgId: string) {
  try {
    const response = await ddb.send(new GetItemCommand({
      TableName: CLOUDSERVICES_TABLE,
      Key: {
        'orgId': { S: orgId },
        'serviceType': { S: 'aws-cognito' }
      }
    }));

    if (response.Item) {
      return {
        userPoolId: response.Item.userPoolId?.S,
        clientId: response.Item.clientId?.S,
        clientSecret: response.Item.clientSecret?.S,
        region: response.Item.region?.S || process.env.AWS_REGION || 'us-east-1',
        // Note: We don't store AWS credentials in the database for security
        // These would come from environment variables or IAM roles
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      };
    }
  } catch (error) {
    console.error('Failed to get Cognito config:', error);
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 POST /api/user/change-password - Changing user password');
    
    // Get token from cookies
    const cookieStore = cookies();
    const accessToken = cookieStore.get('access_token')?.value;
    
    if (!accessToken) {
      console.log('❌ No access token found');
      return NextResponse.json({ 
        success: false, 
        message: "Authentication required" 
      }, { status: 401 });
    }

    // Decode token to get user information
    const claims = jwt.decode(accessToken) as any;
    if (!claims) {
      return NextResponse.json({ 
        success: false, 
        message: "Invalid authentication token" 
      }, { status: 401 });
    }

    // Get organization ID
    const orgId = claims['custom:orgId'] || claims.orgId || request.headers.get('x-org-id');
    if (!orgId) {
      return NextResponse.json({ 
        success: false, 
        message: "Organization not found" 
      }, { status: 400 });
    }

    // Parse request body
    const { currentPassword, newPassword } = await request.json();
    
    if (!currentPassword || !newPassword) {
      return NextResponse.json({
        success: false,
        message: "Current password and new password are required"
      }, { status: 400 });
    }

    // Validate new password strength
    if (newPassword.length < 8) {
      return NextResponse.json({
        success: false,
        message: "New password must be at least 8 characters long"
      }, { status: 400 });
    }

    // Get Cognito configuration for this organization
    const cognitoConfig = await getCognitoConfig(orgId);
    if (!cognitoConfig) {
      return NextResponse.json({
        success: false,
        message: "Organization authentication configuration not found"
      }, { status: 500 });
    }

    // Create Cognito client
    const cognitoClient = new CognitoIdentityProviderClient({
      region: cognitoConfig.region,
      credentials: cognitoConfig.accessKeyId && cognitoConfig.secretAccessKey ? {
        accessKeyId: cognitoConfig.accessKeyId,
        secretAccessKey: cognitoConfig.secretAccessKey,
      } : undefined, // Use default AWS credentials if not provided
    });

    // Change password using Cognito
    try {
      const changePasswordCommand = new ChangePasswordCommand({
        AccessToken: accessToken,
        PreviousPassword: currentPassword,
        ProposedPassword: newPassword,
      });

      await cognitoClient.send(changePasswordCommand);
      
      console.log(`✅ Password changed successfully for user: ${claims.email}`);
      
      return NextResponse.json({
        success: true,
        message: "Password changed successfully"
      });

    } catch (cognitoError: any) {
      console.error('❌ Cognito password change error:', cognitoError);
      
      // Handle specific Cognito errors
      let errorMessage = "Failed to change password";
      
      switch (cognitoError.name) {
        case 'InvalidPasswordException':
          errorMessage = "New password does not meet security requirements";
          break;
        case 'NotAuthorizedException':
          errorMessage = "Current password is incorrect";
          break;
        case 'LimitExceededException':
          errorMessage = "Too many password change attempts. Please try again later.";
          break;
        case 'TooManyRequestsException':
          errorMessage = "Too many requests. Please try again later.";
          break;
        case 'InvalidParameterException':
          errorMessage = "Invalid password format";
          break;
        default:
          errorMessage = cognitoError.message || "Failed to change password";
      }
      
      return NextResponse.json({
        success: false,
        message: errorMessage
      }, { status: 400 });
    }

  } catch (error: any) {
    console.error('❌ Password change error:', error);
    
    return NextResponse.json({
      success: false,
      message: error.message || "Internal server error during password change",
      error: error.name || "PasswordChangeError",
    }, { status: 500 });
  }
}