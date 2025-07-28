// app/api/company-settings/cloud-services/validate/route.ts

export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userPoolId, clientId, region } = body;
    
    if (!userPoolId || !clientId || !region) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    
    // Create a Cognito client using the provided region
    const cognito = new CognitoIdentityProviderClient({
      region,
    });
    
    // Try to describe the user pool to validate the connection
    await cognito.send(
      new DescribeUserPoolCommand({
        UserPoolId: userPoolId,
      })
    );
    
    console.log("✅ Connection validated for UserPoolId:", userPoolId);
    
    // If we reach here, the connection was successful
    return NextResponse.json({
      valid: true,
      message: "AWS Cognito credentials are valid",
    });
  } catch (err: any) {
    console.error("❌ Validation error:", err);
    
    // Provide user-friendly error messages
    let errorMessage = "Failed to validate AWS Cognito credentials";
    
    if (err.name === "UserPoolNotFoundException") {
      errorMessage = "User Pool not found. Please check the User Pool ID.";
    } else if (err.name === "InvalidParameterException") {
      errorMessage = "Invalid parameters provided. Please check your inputs.";
    } else if (err.name === "NotAuthorizedException") {
      errorMessage = "Not authorized. Please check your AWS credentials and permissions.";
    }
    
    return NextResponse.json(
      { 
        valid: false, 
        error: errorMessage,
        message: err.message,
      },
      { status: 400 }
    );
  }
}