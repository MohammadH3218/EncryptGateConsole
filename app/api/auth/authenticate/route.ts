// app/api/auth/authenticate/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  GetUserCommand,
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
    const { username, password } = await req.json();
    
    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: "Missing username or password" },
        { status: 400 }
      );
    }

    console.log(`🔐 Authenticating user ${username}`);

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
    
    let successfulAuth = null;
    let lastError = null;
    
    // Try authentication against each Cognito configuration
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

      console.log(`🔧 Trying org ${orgId} configuration:`, {
        userPoolId,
        clientId,
        region,
        hasClientSecret: !!clientSecret
      });

      // Create Cognito client for this organization
      const cognitoClient = new CognitoIdentityProviderClient({
        region: region,
      });

      try {
        console.log(`🚀 Trying authentication for ${username} in org ${orgId}`);
        
        let authResponse;
        let authError;
        
        // Try USER_PASSWORD_AUTH first (most common)
        try {
          console.log(`🔑 Trying USER_PASSWORD_AUTH flow with username: ${username}`);
          
          // Prepare auth parameters
          const authParams: Record<string, string> = {
            USERNAME: username,
            PASSWORD: password,
          };
          
          // Add SECRET_HASH if client secret is present
          if (clientSecret) {
            authParams.SECRET_HASH = secretHash(username, clientId, clientSecret);
            console.log(`🔐 Including SECRET_HASH for secreted client`);
          }
          
          const authCommand = new InitiateAuthCommand({
            AuthFlow: "USER_PASSWORD_AUTH",
            ClientId: clientId,
            AuthParameters: authParams,
          });
          authResponse = await cognitoClient.send(authCommand);
          console.log(`✅ USER_PASSWORD_AUTH successful for org ${orgId}`);
        } catch (err: any) {
          console.log(`❌ USER_PASSWORD_AUTH failed for org ${orgId}: ${err.name} - ${err.message}`);
          authError = err;
          
          // If not successful, try the original behavior for compatibility
          if (!authResponse && username.includes('@')) {
            const emailPart = username;
            const usernamePart = username.split('@')[0];
            console.log(`🔑 Trying with username part: ${usernamePart}`);
            try {
              const usernameAuthParams: Record<string, string> = {
                USERNAME: usernamePart,
                PASSWORD: password,
              };
              
              if (clientSecret) {
                usernameAuthParams.SECRET_HASH = secretHash(usernamePart, clientId, clientSecret);
              }
              
              const usernameAuthCommand = new InitiateAuthCommand({
                AuthFlow: "USER_PASSWORD_AUTH",
                ClientId: clientId,
                AuthParameters: usernameAuthParams,
              });
              authResponse = await cognitoClient.send(usernameAuthCommand);
              console.log(`✅ Authentication successful with username part: ${usernamePart}`);
            } catch (usernameErr: any) {
              console.log(`❌ Username part authentication also failed: ${usernameErr.name}`);
            }
          }
        }
        
        if (authResponse) {
          // Store successful authentication details
          successfulAuth = {
            authResponse,
            orgId,
            clientId,
            clientSecret,
            region,
            cognitoClient
          };
          break; // Exit the loop on successful authentication
        } else {
          lastError = authError;
          console.log(`❌ Authentication failed for org ${orgId}`);
        }
      } catch (orgError: any) {
        console.error(`❌ Error trying org ${orgId}:`, orgError.message);
        lastError = orgError;
        continue;
      }
    }
    
    // Check if any authentication was successful
    if (!successfulAuth) {
      console.error(`❌ Authentication failed across all organizations`);
      throw lastError || new Error("Authentication failed");
    }
    
    const { authResponse, orgId, clientId, clientSecret, region, cognitoClient } = successfulAuth;
    
    // Handle different auth states
    if (authResponse.ChallengeName) {
      console.log(`🎯 Challenge required: ${authResponse.ChallengeName}`);
      return NextResponse.json({
        success: true,
        ChallengeName: authResponse.ChallengeName,
        session: authResponse.Session,
        message: `Authentication challenge required: ${authResponse.ChallengeName}`,
        challengeParameters: authResponse.ChallengeParameters,
        mfa_required: authResponse.ChallengeName === "SOFTWARE_TOKEN_MFA",
      });
    }

    if (!authResponse.AuthenticationResult?.AccessToken) {
      return NextResponse.json(
        { success: false, message: "Authentication failed - no tokens received" },
        { status: 401 }
      );
    }

    // Get user details
    const getUserCommand = new GetUserCommand({
      AccessToken: authResponse.AuthenticationResult.AccessToken,
    });
    
    const userDetails = await cognitoClient.send(getUserCommand);
    
    const getAttributeValue = (attributeName: string) => {
      const attr = userDetails.UserAttributes?.find(a => a.Name === attributeName);
      return attr?.Value || "";
    };

    const userEmail = getAttributeValue("email") || username;
    const userName = getAttributeValue("name") || 
                    getAttributeValue("preferred_username") || 
                    getAttributeValue("given_name") + " " + getAttributeValue("family_name") ||
                    userEmail.split("@")[0];

    console.log(`✅ Authentication successful for ${userEmail} in org ${orgId}`);

    // Return tokens and user info matching your old system format
    return NextResponse.json({
      success: true,
      message: "Authentication successful",
      access_token: authResponse.AuthenticationResult.AccessToken,
      id_token: authResponse.AuthenticationResult.IdToken,
      refresh_token: authResponse.AuthenticationResult.RefreshToken,
      user: {
        email: userEmail,
        name: userName,
        username: userDetails.Username,
      },
      organizationId: orgId,
    });

  } catch (cognitoError: any) {
    console.error(`❌ Authentication error:`, cognitoError);
    
    let userMessage = "Authentication failed";
    
    if (cognitoError.name === "NotAuthorizedException") {
      userMessage = "Incorrect username or password";
    } else if (cognitoError.name === "UserNotFoundException") {
      userMessage = "User not found";
    } else if (cognitoError.name === "UserNotConfirmedException") {
      userMessage = "Account not confirmed";
    } else if (cognitoError.message) {
      userMessage = cognitoError.message;
    }
    
    return NextResponse.json(
      { 
        success: false, 
        message: userMessage,
        detail: cognitoError.message
      },
      { status: 400 }
    );
  }
}