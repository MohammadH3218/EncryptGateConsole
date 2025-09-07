// app/api/auth/authenticate/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  GetUserCommand,
  RespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

// Helper function to compute SECRET_HASH when clientSecret is present
function secretHash(username: string, clientId: string, clientSecret: string): string {
  return crypto.createHmac("sha256", clientSecret).update(username + clientId).digest("base64");
}

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || "CloudServices";
const USERS_TABLE = process.env.USERS_TABLE_NAME || "SecurityTeamUsers";

export async function POST(req: Request) {
  try {
    const { orgId, email, password } = await req.json();
    
    if (!orgId || !email || !password) {
      return NextResponse.json(
        { success: false, message: "Missing orgId, email, or password" },
        { status: 400 }
      );
    }

    console.log(`🔐 Authenticating user ${email} for org ${orgId}`);

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

    console.log(`🔧 Configuration loaded:`, {
      userPoolId,
      clientId,
      region,
      hasClientSecret: !!clientSecret
    });

    // Create Cognito client (using the service account credentials from env)
    const cognitoClient = new CognitoIdentityProviderClient({
      region: region,
    });

    try {
      // Step 1: Try different authentication flows
      console.log(`🚀 Initiating authentication for ${email}`);
      
      let authResponse;
      let lastError;
      
      // Try USER_PASSWORD_AUTH first (most common)
      try {
        console.log(`🔑 Trying USER_PASSWORD_AUTH flow with email: ${email}`);
        
        // Prepare auth parameters
        const authParams: Record<string, string> = {
          USERNAME: email,
          PASSWORD: password,
        };
        
        // Add SECRET_HASH if client secret is present
        if (clientSecret) {
          authParams.SECRET_HASH = secretHash(email, clientId, clientSecret);
          console.log(`🔐 Including SECRET_HASH for secreted client`);
        }
        
        const authCommand = new InitiateAuthCommand({
          AuthFlow: "USER_PASSWORD_AUTH",
          ClientId: clientId,
          AuthParameters: authParams,
        });
        authResponse = await cognitoClient.send(authCommand);
        console.log(`✅ USER_PASSWORD_AUTH successful`);
      } catch (err: any) {
        console.log(`❌ USER_PASSWORD_AUTH failed: ${err.name} - ${err.message}`);
        lastError = err;
        
        // If USER_PASSWORD_AUTH is not enabled, try USER_SRP_AUTH
        if (err.name === "InvalidParameterException" && err.message.includes("AUTH_FLOW_NOT_SUPPORTED")) {
          console.log(`🔑 Trying USER_SRP_AUTH flow...`);
          try {
            const srpAuthCommand = new InitiateAuthCommand({
              AuthFlow: "USER_SRP_AUTH",
              ClientId: clientId,
              AuthParameters: {
                USERNAME: email,
                SRP_A: "placeholder", // This would need proper SRP implementation
              },
            });
            // Note: USER_SRP_AUTH requires a more complex flow, so this is just a placeholder
            console.log(`⚠️ USER_SRP_AUTH requires client-side SRP calculation, not suitable for server-side auth`);
          } catch (srpErr: any) {
            console.log(`❌ USER_SRP_AUTH also failed: ${srpErr.name} - ${srpErr.message}`);
          }
        }
        
        // If email login fails, try with just the username part
        if (!authResponse && email.includes('@')) {
          const username = email.split('@')[0];
          console.log(`🔑 Trying with username instead of email: ${username}`);
          try {
            const usernameAuthParams: Record<string, string> = {
              USERNAME: username,
              PASSWORD: password,
            };
            
            // Add SECRET_HASH if client secret is present (using username, not email)
            if (clientSecret) {
              usernameAuthParams.SECRET_HASH = secretHash(username, clientId, clientSecret);
              console.log(`🔐 Including SECRET_HASH for username authentication`);
            }
            
            const usernameAuthCommand = new InitiateAuthCommand({
              AuthFlow: "USER_PASSWORD_AUTH",
              ClientId: clientId,
              AuthParameters: usernameAuthParams,
            });
            authResponse = await cognitoClient.send(usernameAuthCommand);
            console.log(`✅ Authentication successful with username: ${username}`);
          } catch (usernameErr: any) {
            console.log(`❌ Username authentication also failed: ${usernameErr.name} - ${usernameErr.message}`);
          }
        }
        
        // If still no success, throw the original error
        if (!authResponse) {
          throw lastError;
        }
      }

      // Step 2: Handle different auth states
      if (authResponse.ChallengeName) {
        // Handle MFA or other challenges
        console.log(`🎯 Challenge required: ${authResponse.ChallengeName}`);
        return NextResponse.json({
          success: true, // Changed to true since challenge is expected
          challenge: true,
          challengeName: authResponse.ChallengeName,
          session: authResponse.Session,
          message: `Authentication challenge required: ${authResponse.ChallengeName}`,
          // Include challenge parameters if they exist
          challengeParameters: authResponse.ChallengeParameters,
        });
      }

      if (!authResponse.AuthenticationResult?.AccessToken) {
        return NextResponse.json(
          { success: false, message: "Authentication failed - no tokens received" },
          { status: 401 }
        );
      }

      // Step 3: Get user details
      const getUserCommand = new GetUserCommand({
        AccessToken: authResponse.AuthenticationResult.AccessToken,
      });
      
      const userDetails = await cognitoClient.send(getUserCommand);
      
      const getAttributeValue = (attributeName: string) => {
        const attr = userDetails.UserAttributes?.find(a => a.Name === attributeName);
        return attr?.Value || "";
      };

      const userEmail = getAttributeValue("email") || email;
      const userName = getAttributeValue("name") || 
                      getAttributeValue("preferred_username") || 
                      getAttributeValue("given_name") + " " + getAttributeValue("family_name") ||
                      userEmail.split("@")[0];

      // Step 4: Update user's last login in SecurityTeamUsers table
      try {
        await ddb.send(new PutItemCommand({
          TableName: USERS_TABLE,
          Item: {
            orgId: { S: orgId },
            email: { S: userEmail },
            name: { S: userName },
            lastLogin: { S: new Date().toISOString() },
            status: { S: "active" },
          },
        }));
        console.log(`✅ Updated last login for ${userEmail}`);
      } catch (error: any) {
        console.warn(`⚠️ Warning updating user login:`, error.message);
        // Don't fail authentication for this
      }

      console.log(`✅ Authentication successful for ${userEmail}`);

      // Step 5: Return tokens and user info
      return NextResponse.json({
        success: true,
        message: "Authentication successful",
        tokens: {
          accessToken: authResponse.AuthenticationResult.AccessToken,
          idToken: authResponse.AuthenticationResult.IdToken,
          refreshToken: authResponse.AuthenticationResult.RefreshToken,
          expiresIn: authResponse.AuthenticationResult.ExpiresIn,
        },
        user: {
          email: userEmail,
          name: userName,
          username: userDetails.Username,
          groups: [], // We could fetch groups here if needed
        },
      });

    } catch (cognitoError: any) {
      console.error(`❌ Cognito authentication error:`, cognitoError);
      console.error(`❌ Error details:`, {
        name: cognitoError.name,
        message: cognitoError.message,
        code: cognitoError.$response?.statusCode,
        requestId: cognitoError.$response?.requestId
      });
      
      let errorMessage = "Authentication failed";
      let userMessage = "Authentication failed";
      
      if (cognitoError.name === "NotAuthorizedException") {
        errorMessage = "Invalid email or password";
        userMessage = "Invalid email or password. Please check your credentials.";
        
        // Special case: if we have a client secret but got NotAuthorized, might be SECRET_HASH issue
        if (clientSecret) {
          console.error(`❌ NotAuthorized with secreted client - SECRET_HASH computation might be incorrect`);
          console.error(`❌ Debug info: username="${email}", clientId="${clientId}", hasClientSecret=true`);
        }
      } else if (cognitoError.name === "UserNotFoundException") {
        errorMessage = "User not found";
        userMessage = "User not found. Please check your email address.";
      } else if (cognitoError.name === "UserNotConfirmedException") {
        errorMessage = "User account not confirmed";
        userMessage = "Your account hasn't been confirmed yet. Please check your email for a confirmation link.";
      } else if (cognitoError.name === "PasswordResetRequiredException") {
        errorMessage = "Password reset required";
        userMessage = "Password reset is required. Please reset your password before logging in.";
      } else if (cognitoError.name === "InvalidParameterException") {
        errorMessage = "Invalid authentication parameters";
        userMessage = "Authentication method not supported. Please contact your administrator.";
        // Log specific details for admin
        console.error(`❌ InvalidParameterException details: This usually means USER_PASSWORD_AUTH is not enabled on the Cognito App Client`);
      } else if (cognitoError.name === "TooManyRequestsException") {
        errorMessage = "Too many login attempts";
        userMessage = "Too many login attempts. Please try again later.";
      } else if (cognitoError.message) {
        errorMessage = cognitoError.message;
        userMessage = cognitoError.message;
      }
      
      return NextResponse.json(
        { 
          success: false, 
          message: userMessage, 
          error: cognitoError.name,
          debug: process.env.NODE_ENV === 'development' ? {
            originalError: errorMessage,
            errorCode: cognitoError.name
          } : undefined
        },
        { status: 401 }
      );
    }

  } catch (error: any) {
    console.error("❌ Authentication error:", error);
    
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Internal server error during authentication",
        error: error.name || "AuthenticationError",
      },
      { status: 500 }
    );
  }
}