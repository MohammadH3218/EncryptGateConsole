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
function secretHash(username: string, clientId: string, clientSecret?: string): string | undefined {
  if (!clientSecret) return undefined;
  return crypto.createHmac("sha256", clientSecret).update(username + clientId).digest("base64");
}

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || "CloudServices";

export async function POST(req: Request) {
  try {
    let { username, email, session, challengeName, challengeResponses, orgId, newPassword, mfaCode } = await req.json();
    if (!username && email) username = email;
    
    if (!username || !session) {
      return NextResponse.json(
        { status: "ERROR", message: "Missing username or session" },
        { status: 400 }
      );
    }

    if (!newPassword && !mfaCode && !challengeResponses) {
      return NextResponse.json(
        { status: "ERROR", message: "Must provide newPassword, mfaCode, or challengeResponses" },
        { status: 400 }
      );
    }

    console.log(`🔄 Responding to auth challenge: ${challengeName} for user: ${username}`);

    let allCognitoConfigs;
    
    if (orgId) {
      // Optimize: Query specific org's Cognito config first
      console.log(`🎯 Looking up Cognito config for org: ${orgId}`);
      try {
        const orgCognitoConfig = await ddb.send(new ScanCommand({
          TableName: CS_TABLE,
          FilterExpression: "orgId = :orgId AND serviceType = :serviceType",
          ExpressionAttributeValues: {
            ":orgId": { S: orgId },
            ":serviceType": { S: "aws-cognito" }
          }
        }));
        
        if (orgCognitoConfig.Items && orgCognitoConfig.Items.length > 0) {
          allCognitoConfigs = orgCognitoConfig;
          console.log(`✅ Found Cognito config for org ${orgId}`);
        } else {
          console.log(`❌ No Cognito config found for org ${orgId}, falling back to scan all`);
          // Fallback to scanning all configurations
          allCognitoConfigs = await ddb.send(new ScanCommand({
            TableName: CS_TABLE,
            FilterExpression: "serviceType = :serviceType",
            ExpressionAttributeValues: {
              ":serviceType": { S: "aws-cognito" }
            }
          }));
        }
      } catch (queryError) {
        console.log(`❌ Query failed for org ${orgId}, falling back to scan all:`, queryError);
        // Fallback to scanning all configurations
        allCognitoConfigs = await ddb.send(new ScanCommand({
          TableName: CS_TABLE,
          FilterExpression: "serviceType = :serviceType",
          ExpressionAttributeValues: {
            ":serviceType": { S: "aws-cognito" }
          }
        }));
      }
    } else {
      // Scan all organizations to find Cognito configurations
      allCognitoConfigs = await ddb.send(new ScanCommand({
        TableName: CS_TABLE,
        FilterExpression: "serviceType = :serviceType",
        ExpressionAttributeValues: {
          ":serviceType": { S: "aws-cognito" }
        }
      }));
    }

    if (!allCognitoConfigs.Items || allCognitoConfigs.Items.length === 0) {
      return NextResponse.json(
        { status: "ERROR", message: "No Cognito configurations found" },
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
        console.log(`🎯 Handling challenge for org ${orgId}`);
        
        // Determine challenge name and prepare responses based on provided data
        let determinedChallengeName: string;
        const responses: Record<string, string> = {
          USERNAME: username
        };

        if (newPassword) {
          determinedChallengeName = "NEW_PASSWORD_REQUIRED";
          responses.NEW_PASSWORD = newPassword;
          console.log(`🔑 Handling NEW_PASSWORD_REQUIRED challenge`);
        } else if (mfaCode) {
          determinedChallengeName = "SOFTWARE_TOKEN_MFA";
          responses.SOFTWARE_TOKEN_MFA_CODE = mfaCode;
          console.log(`🔐 Handling SOFTWARE_TOKEN_MFA challenge`);
        } else if (challengeResponses && challengeName) {
          // Fallback to legacy format for backward compatibility
          determinedChallengeName = challengeName;
          Object.assign(responses, challengeResponses);
          console.log(`🔄 Handling legacy challenge format: ${challengeName}`);
        } else {
          console.error(`❌ Unable to determine challenge type`);
          continue;
        }
        
        // Add SECRET_HASH if client secret is present
        const hash = secretHash(username, clientId, clientSecret);
        if (hash) {
          responses.SECRET_HASH = hash;
          console.log(`🔐 Including SECRET_HASH for challenge response`);
        }
        
        console.log(`🔧 Challenge responses prepared for ${determinedChallengeName}:`, Object.keys(responses));
        
        const challengeCommand = new RespondToAuthChallengeCommand({
          ClientId: clientId,
          ChallengeName: determinedChallengeName as any,
          Session: session,
          ChallengeResponses: responses,
        });

        const challengeResponse = await cognitoClient.send(challengeCommand);

        // Handle different response types
        if (challengeResponse.ChallengeName) {
          // Another challenge is required
          console.log(`🔄 Next challenge required: ${challengeResponse.ChallengeName}`);
          return NextResponse.json({
            status: "CHALLENGE",
            challenge: challengeResponse.ChallengeName,
            session: challengeResponse.Session,
            orgId: orgId,
            secretCode: challengeResponse.ChallengeParameters?.SECRET_CODE,
            // Keep legacy format for backward compatibility
            success: true,
            ChallengeName: challengeResponse.ChallengeName,
          });
        }

        if (challengeResponse.AuthenticationResult?.AccessToken) {
          // Challenge completed successfully
          console.log(`✅ Challenge ${challengeName} completed successfully for org ${orgId}`);
          
          return NextResponse.json({
            status: "SUCCESS",
            accessToken: challengeResponse.AuthenticationResult.AccessToken,
            idToken: challengeResponse.AuthenticationResult.IdToken,
            refreshToken: challengeResponse.AuthenticationResult.RefreshToken,
            orgId: orgId,
            // Keep legacy fields for backward compatibility
            success: true,
            tokens: {
              accessToken: challengeResponse.AuthenticationResult.AccessToken,
              idToken: challengeResponse.AuthenticationResult.IdToken,
              refreshToken: challengeResponse.AuthenticationResult.RefreshToken,
            },
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
          status: "ERROR",
          message: userMessage, 
          detail: lastError.message,
          // Keep legacy field for backward compatibility
          success: false
        },
        { status: 400 }
      );
    }
    
    // Should not reach here
    return NextResponse.json(
      { status: "ERROR", message: "No Cognito configurations available", success: false },
      { status: 500 }
    );

  } catch (error: any) {
    console.error("❌ Challenge response error:", error);
    
    return NextResponse.json(
      {
        status: "ERROR",
        message: error.message || "Internal server error during challenge response",
        error: error.name || "ChallengeResponseError",
        // Keep legacy field for backward compatibility
        success: false,
      },
      { status: 500 }
    );
  }
}