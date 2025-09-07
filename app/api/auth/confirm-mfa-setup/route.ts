// app/api/auth/confirm-mfa-setup/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  CognitoIdentityProviderClient,
  VerifySoftwareTokenCommand,
  RespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  DynamoDBClient,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";

// Helper function to compute SECRET_HASH when clientSecret is present
function secretHash(username: string, clientId: string, clientSecret: string): string {
  return crypto.createHmac("sha256", clientSecret).update(username + clientId).digest("base64");
}

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || "CloudServices";

export async function POST(req: Request) {
  try {
    const { orgId, username, session, code, password, client_time, adjusted_time } = await req.json();
    
    if (!orgId || !username || !code) {
      return NextResponse.json(
        { success: false, message: "Organization ID, username, and MFA code are required" },
        { status: 400 }
      );
    }

    console.log(`🔄 Confirming MFA setup for user: ${username} in org: ${orgId}`);

    // Get organization's Cognito configuration
    const cognitoConfig = await ddb.send(new GetItemCommand({
      TableName: CS_TABLE,
      Key: { orgId: { S: orgId }, serviceType: { S: "aws-cognito" } }
    }));

    if (!cognitoConfig.Item) {
      return NextResponse.json(
        { success: false, message: "Cognito not configured for this organization" },
        { status: 400 }
      );
    }

    const userPoolId = cognitoConfig.Item.userPoolId?.S;
    const clientId = cognitoConfig.Item.clientId?.S;
    const clientSecret = cognitoConfig.Item.clientSecret?.S;
    const region = cognitoConfig.Item.region?.S;

    if (!userPoolId || !clientId || !region) {
      return NextResponse.json(
        { success: false, message: "Incomplete Cognito configuration" },
        { status: 400 }
      );
    }

    // Create Cognito client
    const cognitoClient = new CognitoIdentityProviderClient({
      region: region,
    });

    try {
      console.log(`🎯 Verifying MFA setup code: ${code}`);

      // If we have a session, this is part of a challenge flow
      if (session) {
        // Prepare challenge responses
        const challengeResponses: Record<string, string> = {
          SOFTWARE_TOKEN_MFA_CODE: code,
          USERNAME: username,
        };

        // Add SECRET_HASH if client secret is present
        if (clientSecret) {
          challengeResponses.SECRET_HASH = secretHash(username, clientId, clientSecret);
          console.log(`🔐 Including SECRET_HASH for MFA challenge`);
        }

        const challengeCommand = new RespondToAuthChallengeCommand({
          ClientId: clientId,
          ChallengeName: "MFA_SETUP",
          Session: session,
          ChallengeResponses: challengeResponses,
        });

        const challengeResponse = await cognitoClient.send(challengeCommand);

        if (challengeResponse.AuthenticationResult?.AccessToken) {
          console.log(`✅ MFA setup completed via challenge flow`);
          
          return NextResponse.json({
            success: true,
            message: "MFA setup completed successfully",
            access_token: challengeResponse.AuthenticationResult.AccessToken,
            id_token: challengeResponse.AuthenticationResult.IdToken,
            refresh_token: challengeResponse.AuthenticationResult.RefreshToken,
          });
        }
      } else {
        // Direct verification (less common, but supported)
        const verifyCommand = new VerifySoftwareTokenCommand({
          AccessToken: "", // This would need to be provided
          UserCode: code,
        });

        const verifyResponse = await cognitoClient.send(verifyCommand);
        
        if (verifyResponse.Status === "SUCCESS") {
          console.log(`✅ MFA setup completed via direct verification`);
          
          return NextResponse.json({
            success: true,
            message: "MFA setup completed successfully",
          });
        }
      }

      return NextResponse.json({
        success: false,
        message: "MFA setup verification failed",
      }, { status: 400 });

    } catch (cognitoError: any) {
      console.error(`❌ MFA confirmation error:`, cognitoError);
      console.error(`❌ Error details:`, {
        name: cognitoError.name,
        message: cognitoError.message,
        username,
        code: code.substring(0, 2) + "****" // Log partial code for debugging
      });
      
      let userMessage = "MFA setup confirmation failed";
      
      if (cognitoError.name === "CodeMismatchException") {
        userMessage = "Invalid MFA code. Please check your authenticator app and try again.";
      } else if (cognitoError.name === "ExpiredCodeException") {
        userMessage = "MFA code has expired. Please generate a new code and try again.";
      } else if (cognitoError.name === "NotAuthorizedException") {
        userMessage = "Authentication failed. Please try the setup process again.";
        if (clientSecret) {
          console.error(`❌ NotAuthorized during MFA with secreted client - SECRET_HASH might be incorrect`);
        }
      } else if (cognitoError.name === "EnableSoftwareTokenMFAException") {
        userMessage = "Failed to enable MFA. Please contact support.";
      } else if (cognitoError.message) {
        userMessage = cognitoError.message;
      }
      
      return NextResponse.json(
        { 
          success: false, 
          message: userMessage, 
          error: cognitoError.name,
          detail: cognitoError.message 
        },
        { status: 400 }
      );
    }

  } catch (error: any) {
    console.error("❌ MFA confirmation error:", error);
    
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Internal server error during MFA confirmation",
        error: error.name || "MFAConfirmationError",
      },
      { status: 500 }
    );
  }
}