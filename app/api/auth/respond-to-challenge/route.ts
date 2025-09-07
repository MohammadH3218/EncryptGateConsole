// app/api/auth/respond-to-challenge/route.ts
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
    const { orgId, username, session, challengeName, challengeResponses } = await req.json();
    
    if (!orgId || !username || !session || !challengeName || !challengeResponses) {
      return NextResponse.json(
        { success: false, message: "Missing required challenge response data" },
        { status: 400 }
      );
    }

    console.log(`🔄 Responding to auth challenge: ${challengeName} for user: ${username}`);

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
      console.log(`🎯 Handling challenge: ${challengeName}`);
      
      // Prepare challenge responses
      const responses: Record<string, string> = { ...challengeResponses };
      
      // Add SECRET_HASH if client secret is present
      if (clientSecret) {
        responses.SECRET_HASH = secretHash(username, clientId, clientSecret);
        console.log(`🔐 Including SECRET_HASH for challenge response`);
      }
      
      const challengeCommand = new RespondToAuthChallengeCommand({
        ClientId: clientId,
        ChallengeName: challengeName as any,
        Session: session,
        ChallengeResponses: responses,
      });

      const challengeResponse = await cognitoClient.send(challengeCommand);

      // Handle different response types
      if (challengeResponse.ChallengeName) {
        // Another challenge is required
        console.log(`🔄 Next challenge required: ${challengeResponse.ChallengeName}`);
        return NextResponse.json({
          success: true,
          challenge: challengeResponse.ChallengeName,
          session: challengeResponse.Session,
          message: `Next challenge: ${challengeResponse.ChallengeName}`,
        });
      }

      if (challengeResponse.AuthenticationResult?.AccessToken) {
        // Challenge completed successfully
        console.log(`✅ Challenge ${challengeName} completed successfully`);
        
        return NextResponse.json({
          success: true,
          message: "Challenge completed successfully",
          tokens: {
            accessToken: challengeResponse.AuthenticationResult.AccessToken,
            idToken: challengeResponse.AuthenticationResult.IdToken,
            refreshToken: challengeResponse.AuthenticationResult.RefreshToken,
            expiresIn: challengeResponse.AuthenticationResult.ExpiresIn,
          },
        });
      }

      // Unexpected response
      console.warn(`⚠️ Unexpected challenge response for ${challengeName}`);
      return NextResponse.json({
        success: false,
        message: "Unexpected challenge response",
      }, { status: 500 });

    } catch (cognitoError: any) {
      console.error(`❌ Challenge response error:`, cognitoError);
      console.error(`❌ Error details:`, {
        name: cognitoError.name,
        message: cognitoError.message,
        challengeName,
        username
      });
      
      let userMessage = "Challenge response failed";
      
      if (cognitoError.name === "NotAuthorizedException") {
        userMessage = "Invalid challenge response. Please check your input.";
        if (clientSecret) {
          console.error(`❌ NotAuthorized during challenge with secreted client - SECRET_HASH might be incorrect`);
        }
      } else if (cognitoError.name === "InvalidParameterException") {
        userMessage = "Invalid challenge parameters.";
      } else if (cognitoError.name === "CodeMismatchException") {
        userMessage = "Invalid verification code. Please try again.";
      } else if (cognitoError.name === "ExpiredCodeException") {
        userMessage = "Verification code has expired. Please request a new one.";
      } else if (cognitoError.name === "InvalidPasswordException") {
        userMessage = "Password does not meet requirements. Please check the password policy.";
      } else if (cognitoError.name === "LimitExceededException") {
        userMessage = "Too many attempts. Please try again later.";
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
    console.error("❌ Challenge response error:", error);
    
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Internal server error during challenge response",
        error: error.name || "ChallengeResponseError",
      },
      { status: 500 }
    );
  }
}