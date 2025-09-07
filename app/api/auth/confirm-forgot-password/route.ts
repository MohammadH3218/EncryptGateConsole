// app/api/auth/confirm-forgot-password/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
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
    const { username, code, password } = await req.json();
    
    if (!username || !code || !password) {
      return NextResponse.json(
        { success: false, message: "Username, code, and new password are required" },
        { status: 400 }
      );
    }

    console.log(`🔄 Confirming forgot password for: ${username}`);

    // Find the organization that has this user
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
    let successfulConfirm = false;
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
        console.log(`🔍 Trying password reset confirmation in org: ${orgId}`);
        
        // Create Cognito client
        const cognitoClient = new CognitoIdentityProviderClient({
          region: region,
        });

        // Prepare parameters
        const confirmParams: any = {
          ClientId: clientId,
          Username: username,
          ConfirmationCode: code,
          Password: password,
        };

        // Add SECRET_HASH if client secret is present
        if (clientSecret) {
          confirmParams.SecretHash = secretHash(username, clientId, clientSecret);
          console.log(`🔐 Including SECRET_HASH for password reset confirmation`);
        }

        const confirmCommand = new ConfirmForgotPasswordCommand(confirmParams);
        await cognitoClient.send(confirmCommand);
        
        console.log(`✅ Password reset confirmed successfully for ${username} in org ${orgId}`);
        successfulConfirm = true;
        break;

      } catch (cognitoError: any) {
        console.log(`❌ Password reset confirmation failed in org ${orgId}: ${cognitoError.name}`);
        lastError = cognitoError;
        
        // If user not found in this pool, continue to next
        if (cognitoError.name === "UserNotFoundException") {
          continue;
        }
        
        // For code-related errors, don't continue (user is in this pool)
        if (cognitoError.name === "CodeMismatchException" || 
            cognitoError.name === "ExpiredCodeException" ||
            cognitoError.name === "InvalidPasswordException") {
          break;
        }
        
        // For other errors, continue to next pool
        continue;
      }
    }

    if (successfulConfirm) {
      return NextResponse.json({
        success: true,
        message: "Password has been reset successfully. You can now log in with your new password.",
      });
    }

    // Handle specific errors
    let userMessage = "Password reset failed. Please check your code and try again.";
    
    if (lastError) {
      if (lastError.name === "CodeMismatchException") {
        userMessage = "Invalid verification code. Please check the code and try again.";
      } else if (lastError.name === "ExpiredCodeException") {
        userMessage = "Verification code has expired. Please request a new password reset.";
      } else if (lastError.name === "InvalidPasswordException") {
        userMessage = "Password does not meet requirements. Please choose a stronger password.";
      } else if (lastError.name === "LimitExceededException") {
        userMessage = "Too many attempts. Please wait before trying again.";
      } else if (lastError.name === "UserNotFoundException") {
        userMessage = "User not found. Please check your email address.";
      }
    }

    return NextResponse.json(
      { 
        success: false, 
        message: userMessage,
        error: lastError?.name || "ConfirmForgotPasswordError"
      },
      { status: 400 }
    );

  } catch (error: any) {
    console.error("❌ Confirm forgot password error:", error);
    
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Internal server error during password reset confirmation",
        error: error.name || "ConfirmForgotPasswordError",
      },
      { status: 500 }
    );
  }
}