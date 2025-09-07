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
    const { username, session, challengeName, challengeResponses } = await req.json();
    
    if (!username || !session || !challengeName || !challengeResponses) {
      return NextResponse.json(
        { success: false, message: "Missing required challenge response data" },
        { status: 400 }
      );
    }

    console.log(`🔄 Responding to auth challenge: ${challengeName} for user: ${username}`);

    // Scan all organizations to find Cognito configurations
    const allCognitoConfigs = await ddb.send(new ScanCommand({
      TableName: CS_TABLE,
      FilterExpression: "serviceType = :serviceType",
      ExpressionAttributeValues: {
        ":serviceType": { S: "aws-cognito" }
      }
    }));

    if (!allCognitoConfigs.Items || allCognitoConfigs.Items.length === 0) {
      return NextResponse.json(
        { success: false, message: "No Cognito configurations found" },
        { status: 400 }
      );
    }

    console.log(`🔍 Found ${allCognitoConfigs.Items.length} Cognito configurations to try`);
    
    let successfulResponse = null;
    let lastError = null;
    
    // Try challenge response against each Cognito configuration
    for (const configItem of allCognitoConfigs.Items) {

      const orgId = configItem.orgId?.S;
      const userPoolId = configItem.userPoolId?.S;
      const clientId = configItem.clientId?.S;
      const clientSecret = configItem.clientSecret?.S;
      const region = configItem.region?.S;

      if (!userPoolId || !clientId || !region || !orgId) {
        console.log(`⚠️ Skipping incomplete config for org ${orgId}`);
        continue;
      }

      console.log(`🔧 Trying org ${orgId} for challenge response`);

      // Create Cognito client for this organization
      const cognitoClient = new CognitoIdentityProviderClient({
        region: region,
      });

      try {
        console.log(`🎯 Handling challenge: ${challengeName} for org ${orgId}`);
        
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
            ChallengeName: challengeResponse.ChallengeName,
            session: challengeResponse.Session,
            message: `Next challenge: ${challengeResponse.ChallengeName}`,
            secretCode: challengeResponse.ChallengeParameters?.SECRET_CODE,
          });
        }

        if (challengeResponse.AuthenticationResult?.AccessToken) {
          // Challenge completed successfully
          console.log(`✅ Challenge ${challengeName} completed successfully for org ${orgId}`);
          
          return NextResponse.json({
            success: true,
            message: "Challenge completed successfully",
            access_token: challengeResponse.AuthenticationResult.AccessToken,
            id_token: challengeResponse.AuthenticationResult.IdToken,
            refresh_token: challengeResponse.AuthenticationResult.RefreshToken,
            organizationId: orgId,
          });
        }

        // Unexpected response but continue trying other orgs
        console.warn(`⚠️ Unexpected challenge response for ${challengeName} in org ${orgId}`);
        continue;

      } catch (cognitoError: any) {
        console.error(`❌ Challenge response error for org ${orgId}:`, cognitoError.message);
        lastError = cognitoError;
        continue;
      }
    }
    
    // If no successful response, return the last error
    if (lastError) {
      console.error(`❌ Challenge response failed across all organizations`);
      
      let userMessage = "Challenge response failed";
      
      if (lastError.name === "NotAuthorizedException") {
        userMessage = "Invalid challenge response. Please check your input.";
      } else if (lastError.name === "CodeMismatchException") {
        userMessage = "Invalid verification code. Please try again.";
      } else if (lastError.name === "ExpiredCodeException") {
        userMessage = "Verification code has expired. Please request a new one.";
      } else if (lastError.name === "InvalidPasswordException") {
        userMessage = "Password does not meet requirements.";
      } else if (lastError.message) {
        userMessage = lastError.message;
      }
      
      return NextResponse.json(
        { 
          success: false, 
          message: userMessage, 
          detail: lastError.message
        },
        { status: 400 }
      );
    }
    
    // Should not reach here
    return NextResponse.json(
      { success: false, message: "No Cognito configurations available" },
      { status: 500 }
    );

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