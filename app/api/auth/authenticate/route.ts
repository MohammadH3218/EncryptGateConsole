// app/api/auth/authenticate/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
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
    const region = cognitoConfig.Item.region?.S;

    if (!userPoolId || !clientId || !region) {
      return NextResponse.json(
        { success: false, message: "Incomplete Cognito configuration" },
        { status: 400 }
      );
    }

    // Create Cognito client (using the service account credentials from env)
    const cognitoClient = new CognitoIdentityProviderClient({
      region: region,
    });

    try {
      // Step 1: Initiate authentication
      console.log(`🚀 Initiating authentication for ${email}`);
      const authCommand = new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: clientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      });

      const authResponse = await cognitoClient.send(authCommand);

      // Step 2: Handle different auth states
      if (authResponse.ChallengeName) {
        // Handle MFA or other challenges
        return NextResponse.json({
          success: false,
          challenge: authResponse.ChallengeName,
          message: `Authentication challenge required: ${authResponse.ChallengeName}`,
          session: authResponse.Session,
        }, { status: 200 });
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
      
      let errorMessage = "Authentication failed";
      
      if (cognitoError.name === "NotAuthorizedException") {
        errorMessage = "Invalid email or password";
      } else if (cognitoError.name === "UserNotFoundException") {
        errorMessage = "User not found";
      } else if (cognitoError.name === "UserNotConfirmedException") {
        errorMessage = "User account not confirmed";
      } else if (cognitoError.name === "PasswordResetRequiredException") {
        errorMessage = "Password reset required";
      } else if (cognitoError.name === "InvalidParameterException") {
        errorMessage = "Invalid authentication parameters";
      } else if (cognitoError.message) {
        errorMessage = cognitoError.message;
      }
      
      return NextResponse.json(
        { success: false, message: errorMessage, error: cognitoError.name },
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