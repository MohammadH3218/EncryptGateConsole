// app/api/setup/validate-cognito/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";

export async function POST(req: Request) {
  try {
    const { userPoolId, clientId, region, accessKey, secretKey } = await req.json();
    
    if (!userPoolId || !clientId || !region || !accessKey || !secretKey) {
      return NextResponse.json(
        { valid: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    console.log(`🔍 Validating Cognito config for user pool: ${userPoolId}`);
    
    // Create Cognito client with provided credentials
    const cognitoClient = new CognitoIdentityProviderClient({
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });

    try {
      // Test 1: Describe user pool to verify it exists and we have access
      console.log("📋 Testing user pool access...");
      const describeCommand = new DescribeUserPoolCommand({
        UserPoolId: userPoolId,
      });
      const userPool = await cognitoClient.send(describeCommand);
      
      console.log(`✅ User pool found: ${userPool.UserPool?.Name}`);

      // Test 2: List users to verify we can read user data
      console.log("👥 Testing user listing...");
      const listUsersCommand = new ListUsersCommand({
        UserPoolId: userPoolId,
        Limit: 20, // Limit for validation
      });
      const usersResponse = await cognitoClient.send(listUsersCommand);
      
      const users = (usersResponse.Users || []).map(user => {
        const getAttributeValue = (attributeName: string) => {
          const attr = user.Attributes?.find(a => a.Name === attributeName);
          return attr?.Value || "";
        };

        return {
          username: user.Username || "",
          email: getAttributeValue("email"),
          enabled: user.Enabled || false,
          userCreateDate: user.UserCreateDate?.toISOString() || "",
          userStatus: user.UserStatus || "UNKNOWN",
          attributes: {
            email_verified: getAttributeValue("email_verified"),
            name: getAttributeValue("name"),
            given_name: getAttributeValue("given_name"),
            family_name: getAttributeValue("family_name"),
            preferred_username: getAttributeValue("preferred_username"),
          }
        };
      });

      console.log(`✅ Found ${users.length} users in user pool`);

      return NextResponse.json({
        valid: true,
        message: `Successfully validated Cognito configuration. Found ${users.length} users.`,
        userPool: {
          id: userPool.UserPool?.Id,
          name: userPool.UserPool?.Name,
          status: userPool.UserPool?.Status,
          creationDate: userPool.UserPool?.CreationDate?.toISOString(),
          policies: userPool.UserPool?.Policies,
        },
        users,
      });

    } catch (cognitoError: any) {
      console.error("❌ Cognito validation error:", cognitoError);
      
      let errorMessage = "Failed to validate AWS Cognito configuration";
      
      if (cognitoError.name === "ResourceNotFoundException") {
        errorMessage = "User pool not found. Please check your User Pool ID.";
      } else if (cognitoError.name === "NotAuthorizedException" || cognitoError.name === "UnauthorizedOperation") {
        errorMessage = "Access denied. Please check your AWS credentials and IAM permissions.";
      } else if (cognitoError.name === "InvalidParameterException") {
        errorMessage = "Invalid parameters. Please check your configuration values.";
      } else if (cognitoError.message) {
        errorMessage = cognitoError.message;
      }
      
      return NextResponse.json({
        valid: false,
        message: errorMessage,
        error: cognitoError.name || "CognitoError",
      }, { status: 400 });
    }

  } catch (error: any) {
    console.error("❌ Setup validation error:", error);
    
    return NextResponse.json(
      {
        valid: false,
        message: error.message || "Internal server error during validation",
        error: error.name || "ValidationError",
      },
      { status: 500 }
    );
  }
}