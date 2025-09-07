// app/api/auth/setup-mfa/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  CognitoIdentityProviderClient,
  AssociateSoftwareTokenCommand,
} from "@aws-sdk/client-cognito-identity-provider";

export async function POST(req: Request) {
  try {
    const { access_token } = await req.json();
    
    if (!access_token) {
      return NextResponse.json(
        { success: false, message: "Access token is required" },
        { status: 400 }
      );
    }

    console.log(`🔄 Setting up MFA for user`);

    // We need to determine the region from the access token or use default
    // For now, we'll use the environment region
    const cognitoClient = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    try {
      // Associate software token for MFA setup
      const associateCommand = new AssociateSoftwareTokenCommand({
        AccessToken: access_token,
      });

      const response = await cognitoClient.send(associateCommand);
      
      console.log(`✅ MFA setup initiated successfully`);

      return NextResponse.json({
        success: true,
        secretCode: response.SecretCode,
        message: "MFA setup initiated. Please scan the QR code or enter the secret manually.",
      });

    } catch (cognitoError: any) {
      console.error(`❌ MFA setup error:`, cognitoError);
      
      let userMessage = "MFA setup failed";
      
      if (cognitoError.name === "NotAuthorizedException") {
        userMessage = "Access token is invalid or expired. Please log in again.";
      } else if (cognitoError.name === "InvalidParameterException") {
        userMessage = "Invalid request parameters for MFA setup.";
      } else if (cognitoError.name === "SoftwareTokenMFANotFoundException") {
        userMessage = "Software token MFA is not enabled for this user pool.";
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
    console.error("❌ MFA setup error:", error);
    
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Internal server error during MFA setup",
        error: error.name || "MFASetupError",
      },
      { status: 500 }
    );
  }
}