// app/api/auth/verify-mfa/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  CognitoIdentityProviderClient,
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
    const { orgId, username, session, code } = await req.json();
    
    if (!orgId || !username || !session || !code) {
      return NextResponse.json(
        { success: false, message: "Organization ID, username, session, and MFA code are required" },
        { status: 400 }
      );
    }

    console.log(`🔄 Verifying MFA for user: ${username} in org: ${orgId}`);

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
      console.log(`🎯 Responding to SOFTWARE_TOKEN_MFA challenge`);

      // Prepare challenge responses
      const challengeResponses: Record<string, string> = {
        SOFTWARE_TOKEN_MFA_CODE: code,
        USERNAME: username,
      };

      // Add SECRET_HASH if client secret is present
      if (clientSecret) {
        challengeResponses.SECRET_HASH = secretHash(username, clientId, clientSecret);
        console.log(`🔐 Including SECRET_HASH for MFA verification`);
      }

      const challengeCommand = new RespondToAuthChallengeCommand({
        ClientId: clientId,
        ChallengeName: "SOFTWARE_TOKEN_MFA",
        Session: session,
        ChallengeResponses: challengeResponses,
      });

      const challengeResponse = await cognitoClient.send(challengeCommand);

      if (challengeResponse.AuthenticationResult?.AccessToken) {
        console.log(`✅ MFA verification successful for ${username}`);
        
        return NextResponse.json({
          success: true,
          message: "MFA verification successful",
          access_token: challengeResponse.AuthenticationResult.AccessToken,
          id_token: challengeResponse.AuthenticationResult.IdToken,
          refresh_token: challengeResponse.AuthenticationResult.RefreshToken,
        });
      }

      // Check if another challenge is required
      if (challengeResponse.ChallengeName) {
        console.log(`🔄 Additional challenge required: ${challengeResponse.ChallengeName}`);
        return NextResponse.json({
          success: true,
          challenge: challengeResponse.ChallengeName,
          session: challengeResponse.Session,
          message: `Additional challenge required: ${challengeResponse.ChallengeName}`,
        });
      }

      return NextResponse.json({
        success: false,
        message: "MFA verification failed - unexpected response",
      }, { status: 400 });

    } catch (cognitoError: any) {
      console.error(`❌ MFA verification error:`, cognitoError);
      console.error(`❌ Error details:`, {
        name: cognitoError.name,
        message: cognitoError.message,
        username,
        code: code.substring(0, 2) + "****" // Log partial code for debugging
      });
      
      let userMessage = "MFA verification failed";
      
      if (cognitoError.name === "CodeMismatchException") {
        userMessage = "Invalid MFA code. Please check your authenticator app and try again.";
      } else if (cognitoError.name === "ExpiredCodeException") {
        userMessage = "MFA code has expired. Please generate a new code and try again.";
      } else if (cognitoError.name === "NotAuthorizedException") {
        userMessage = "MFA verification failed. Please try again.";
        if (clientSecret) {
          console.error(`❌ NotAuthorized during MFA with secreted client - SECRET_HASH might be incorrect`);
        }
      } else if (cognitoError.name === "InvalidSessionException") {
        userMessage = "Session expired. Please log in again.";
      } else if (cognitoError.name === "TooManyRequestsException") {
        userMessage = "Too many attempts. Please wait before trying again.";
      } else if (cognitoError.message) {
        userMessage = cognitoError.message;
      }
      
      return NextResponse.json(
        { 
          success: false, 
          message: userMessage, 
          error: cognitoError.name 
        },
        { status: 400 }
      );
    }

  } catch (error: any) {
    console.error("❌ MFA verification error:", error);
    
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Internal server error during MFA verification",
        error: error.name || "MFAVerificationError",
      },
      { status: 500 }
    );
  }
}