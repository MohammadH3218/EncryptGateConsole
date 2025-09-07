// app/api/auth/refresh/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
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
    const { orgId, refreshToken, username } = await req.json();
    
    if (!orgId || !refreshToken || !username) {
      return NextResponse.json(
        { success: false, message: "Missing orgId, refreshToken, or username" },
        { status: 400 }
      );
    }

    console.log(`🔄 Refreshing tokens for user ${username} in org ${orgId}`);

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
    const clientSecret = cognitoConfig.Item.clientSecret?.S; // Optional
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
      console.log(`🚀 Initiating token refresh...`);
      
      // Prepare auth parameters
      const authParams: Record<string, string> = {
        REFRESH_TOKEN: refreshToken,
      };
      
      // Add SECRET_HASH if client secret is present
      if (clientSecret) {
        authParams.SECRET_HASH = secretHash(username, clientId, clientSecret);
        console.log(`🔐 Including SECRET_HASH for refresh token`);
      }
      
      const refreshCommand = new InitiateAuthCommand({
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: clientId,
        AuthParameters: authParams,
      });

      const authResponse = await cognitoClient.send(refreshCommand);

      if (!authResponse.AuthenticationResult?.AccessToken) {
        return NextResponse.json(
          { success: false, message: "Token refresh failed - no tokens received" },
          { status: 401 }
        );
      }

      console.log(`✅ Token refresh successful for ${username}`);

      // Return new tokens
      return NextResponse.json({
        success: true,
        message: "Tokens refreshed successfully",
        tokens: {
          accessToken: authResponse.AuthenticationResult.AccessToken,
          idToken: authResponse.AuthenticationResult.IdToken,
          // Note: Cognito may not return a new refresh token on refresh
          refreshToken: authResponse.AuthenticationResult.RefreshToken || refreshToken,
          expiresIn: authResponse.AuthenticationResult.ExpiresIn,
        },
      });

    } catch (cognitoError: any) {
      console.error(`❌ Token refresh error:`, cognitoError);
      console.error(`❌ Error details:`, {
        name: cognitoError.name,
        message: cognitoError.message,
        code: cognitoError.$response?.statusCode,
      });
      
      let userMessage = "Token refresh failed";
      
      if (cognitoError.name === "NotAuthorizedException") {
        userMessage = "Refresh token is invalid or expired. Please log in again.";
        if (clientSecret) {
          console.error(`❌ NotAuthorized during refresh with secreted client - SECRET_HASH computation might be incorrect`);
        }
      } else if (cognitoError.name === "InvalidParameterException") {
        userMessage = "Invalid refresh token. Please log in again.";
      } else if (cognitoError.name === "UserNotFoundException") {
        userMessage = "User not found. Please log in again.";
      } else if (cognitoError.message) {
        userMessage = cognitoError.message;
      }
      
      return NextResponse.json(
        { 
          success: false, 
          message: userMessage, 
          error: cognitoError.name,
        },
        { status: 401 }
      );
    }

  } catch (error: any) {
    console.error("❌ Refresh token error:", error);
    
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Internal server error during token refresh",
        error: error.name || "RefreshError",
      },
      { status: 500 }
    );
  }
}