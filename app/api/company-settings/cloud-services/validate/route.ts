// app/api/company-settings/cloud-services/validate/route.ts

export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";

// List of valid AWS regions
const VALID_AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'af-south-1', 'ap-east-1', 'ap-south-1', 'ap-northeast-1',
  'ap-northeast-2', 'ap-northeast-3', 'ap-southeast-1',
  'ap-southeast-2', 'ca-central-1', 'eu-central-1',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-south-1',
  'eu-north-1', 'me-south-1', 'sa-east-1'
];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userPoolId, clientId, region } = body;
    
    // Input validation
    if (!userPoolId || !clientId || !region) {
      return NextResponse.json(
        { 
          valid: false,
          error: "Missing required fields",
          message: "User Pool ID, Client ID and Region are all required" 
        },
        { status: 400 }
      );
    }
    
    // Validate region format
    if (!VALID_AWS_REGIONS.includes(region)) {
      return NextResponse.json(
        { 
          valid: false,
          error: "Invalid region format",
          message: `"${region}" is not a valid AWS region. Please use a standard AWS region code like "us-east-1".`
        },
        { status: 400 }
      );
    }
    
    // Validate User Pool ID format
    const userPoolRegionPrefix = userPoolId.split('_')[0];
    if (!userPoolId.includes('_') || !VALID_AWS_REGIONS.includes(userPoolRegionPrefix)) {
      return NextResponse.json(
        { 
          valid: false,
          error: "Invalid User Pool ID format",
          message: "User Pool ID should be in the format 'region_identifier', e.g. 'us-east-1_abcdefghi'"
        },
        { status: 400 }
      );
    }
    
    // If the region in the User Pool ID doesn't match the provided region
    if (userPoolRegionPrefix !== region) {
      return NextResponse.json(
        { 
          valid: false,
          error: "Region mismatch",
          message: `The region in your User Pool ID (${userPoolRegionPrefix}) doesn't match the provided region (${region}). They must be the same.`
        },
        { status: 400 }
      );
    }
    
    // Create a Cognito client using the validated region
    const cognito = new CognitoIdentityProviderClient({
      region,
    });
    
    // Try to describe the user pool to validate the connection
    try {
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
      console.error("❌ Cognito API validation error:", err);
      
      // Provide user-friendly error messages
      let errorMessage = "Failed to validate AWS Cognito credentials";
      
      if (err.name === "UserPoolNotFoundException") {
        errorMessage = "User Pool not found. Please check the User Pool ID.";
      } else if (err.name === "InvalidParameterException") {
        errorMessage = "Invalid parameters. Please check your inputs.";
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
  } catch (err: any) {
    console.error("❌ Validation function error:", err);
    
    return NextResponse.json(
      { 
        valid: false, 
        error: "Internal server error",
        message: err.message,
      },
      { status: 500 }
    );
  }
}