// app/api/auth/forgot-password/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  CognitoIdentityProviderClient,
  ForgotPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  DynamoDBClient,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";

// Helper function to compute SECRET_HASH when clientSecret is present
function secretHash(username: string, clientId: string, clientSecret: string): string {
  return crypto.createHmac("sha256", clientSecret).update(username + clientId).digest("base64");
}

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || "CloudServices";

export async function POST(req: Request) {
  try {
    const { username } = await req.json();
    
    if (!username) {
      return NextResponse.json(
        { success: false, message: "Username/email is required" },
        { status: 400 }
      );
    }

    console.log(`🔄 Initiating forgot password for: ${username}`);

    // Find the organization that has this user
    // Since we don't have orgId, we need to search all Cognito configs
    const scanCommand = new ScanCommand({
      TableName: CS_TABLE,
      FilterExpression: "serviceType = :serviceType",
      ExpressionAttributeValues: {
        ":serviceType": { S: "aws-cognito" }
      }
    });

    const cognitoConfigs = await ddb.send(scanCommand);
    
    if (!cognitoConfigs.Items || cognitoConfigs.Items.length === 0) {
      return NextResponse.json(
        { success: false, message: "No Cognito configurations found" },
        { status: 400 }
      );
    }

    // Try each Cognito config until we find the user
    let successfulReset = false;
    let lastError;

    for (const configItem of cognitoConfigs.Items) {
      const userPoolId = configItem.userPoolId?.S;
      const clientId = configItem.clientId?.S;
      const clientSecret = configItem.clientSecret?.S;
      const region = configItem.region?.S;
      const orgId = configItem.orgId?.S;

      if (!userPoolId || !clientId || !region) {
        continue;
      }

      try {
        console.log(`🔍 Trying forgot password in org: ${orgId}`);
        
        // Create Cognito client
        const cognitoClient = new CognitoIdentityProviderClient({
          region: region,
        });

        // Prepare parameters
        const forgotPasswordParams: any = {
          ClientId: clientId,
          Username: username,
        };

        // Add SECRET_HASH if client secret is present
        if (clientSecret) {
          forgotPasswordParams.SecretHash = secretHash(username, clientId, clientSecret);
          console.log(`🔐 Including SECRET_HASH for forgot password`);
        }

        const forgotPasswordCommand = new ForgotPasswordCommand(forgotPasswordParams);
        await cognitoClient.send(forgotPasswordCommand);
        
        console.log(`✅ Forgot password initiated successfully for ${username} in org ${orgId}`);
        successfulReset = true;
        break;

      } catch (cognitoError: any) {
        console.log(`❌ Forgot password failed in org ${orgId}: ${cognitoError.name}`);
        lastError = cognitoError;
        
        // If user not found in this pool, continue to next
        if (cognitoError.name === "UserNotFoundException") {
          continue;
        }
        
        // For other errors, we might want to continue or break depending on the error
        if (cognitoError.name === "InvalidParameterException" || 
            cognitoError.name === "NotAuthorizedException") {
          continue;
        }
        
        // For serious errors, break
        break;
      }
    }

    if (successfulReset) {
      return NextResponse.json({
        success: true,
        message: "Password reset code sent to your email. Please check your inbox and spam folder.",
      });
    }

    // If no successful reset, return user-friendly error
    console.error(`❌ Forgot password failed for ${username}:`, lastError);
    
    let userMessage = "If this email exists in our system, a password reset code has been sent.";
    
    if (lastError) {
      if (lastError.name === "LimitExceededException") {
        userMessage = "Too many password reset attempts. Please try again later.";
      } else if (lastError.name === "InvalidParameterException") {
        userMessage = "Invalid email format. Please check your email address.";
      }
    }

    // Always return success for security (don't reveal if user exists)
    return NextResponse.json({
      success: true,
      message: userMessage,
    });

  } catch (error: any) {
    console.error("❌ Forgot password error:", error);
    
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Internal server error during password reset request",
        error: error.name || "ForgotPasswordError",
      },
      { status: 500 }
    );
  }
}