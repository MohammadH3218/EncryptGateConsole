// app/api/auth/test-config/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolClientCommand,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  DynamoDBClient,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || "CloudServices";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const orgId = url.searchParams.get('orgId');
    
    if (!orgId) {
      return NextResponse.json(
        { success: false, message: "Missing orgId parameter" },
        { status: 400 }
      );
    }

    console.log(`🔍 Testing Cognito configuration for org: ${orgId}`);

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

    // Create Cognito client
    const cognitoClient = new CognitoIdentityProviderClient({
      region: region,
    });

    try {
      // Test 1: Describe User Pool
      console.log(`📋 Testing user pool access...`);
      const userPoolCommand = new DescribeUserPoolCommand({
        UserPoolId: userPoolId,
      });
      const userPool = await cognitoClient.send(userPoolCommand);
      
      // Test 2: Describe User Pool Client
      console.log(`📱 Testing app client configuration...`);
      const clientCommand = new DescribeUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
      });
      const client = await cognitoClient.send(clientCommand);

      const authFlows = client.UserPoolClient?.ExplicitAuthFlows || [];
      const hasUserPasswordAuth = authFlows.includes('USER_PASSWORD_AUTH');
      const hasUserSrpAuth = authFlows.includes('USER_SRP_AUTH');

      console.log(`✅ Configuration test successful`);
      console.log(`📊 Auth flows enabled:`, authFlows);

      return NextResponse.json({
        success: true,
        configuration: {
          userPoolId,
          clientId,
          region,
          userPoolName: userPool.UserPool?.Name,
          authFlows: authFlows,
          hasUserPasswordAuth,
          hasUserSrpAuth,
          hasClientSecret: !!cognitoConfig.Item.clientSecret?.S,
          clientSecretStored: !!cognitoConfig.Item.clientSecret?.S,
          generateSecret: client.UserPoolClient?.GenerateSecret || false,
        },
        recommendations: [
          ...(hasUserPasswordAuth ? [] : [
            "❌ USER_PASSWORD_AUTH is not enabled on the App Client. This is required for direct authentication."
          ]),
          ...(hasUserSrpAuth ? [] : [
            "⚠️ USER_SRP_AUTH is not enabled. This is the default secure method."
          ]),
          ...(authFlows.length === 0 ? [
            "❌ No authentication flows are enabled on the App Client."
          ] : []),
          ...(client.UserPoolClient?.GenerateSecret && !cognitoConfig.Item.clientSecret?.S ? [
            "❌ App Client has GenerateSecret=true but no client secret is stored in database. Update your organization setup."
          ] : []),
          ...(!client.UserPoolClient?.GenerateSecret && cognitoConfig.Item.clientSecret?.S ? [
            "⚠️ Database has client secret but App Client has GenerateSecret=false. This might cause issues."
          ] : []),
        ]
      });

    } catch (cognitoError: any) {
      console.error(`❌ Cognito test error:`, cognitoError);
      
      return NextResponse.json({
        success: false,
        message: "Failed to test Cognito configuration",
        error: cognitoError.name,
        details: cognitoError.message,
        recommendations: [
          "Check if the User Pool ID and Client ID are correct",
          "Verify AWS credentials have proper permissions",
          "Ensure the App Client exists in the specified User Pool"
        ]
      }, { status: 400 });
    }

  } catch (error: any) {
    console.error("❌ Configuration test error:", error);
    
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Internal server error during configuration test",
        error: error.name || "ConfigTestError",
      },
      { status: 500 }
    );
  }
}