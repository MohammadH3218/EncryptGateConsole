// app/api/auth/auto-register/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  CognitoIdentityProviderClient,
  GetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  DynamoDBClient,
  PutItemCommand,
  ScanCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });
const USERS_TABLE = process.env.USERS_TABLE_NAME || "SecurityTeamUsers";
const ORGS_TABLE = process.env.ORGANIZATIONS_TABLE_NAME || "Organizations";
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || "CloudServices";

export async function POST(req: Request) {
  try {
    const { email, tokens, organizationId, organizationName } = await req.json();
    
    if (!email || !tokens?.access || !organizationId) {
      return NextResponse.json(
        { success: false, message: "Email, tokens, and organization ID are required" },
        { status: 400 }
      );
    }

    console.log(`🔄 Auto-registering user: ${email} for org: ${organizationId}`);

    // Get organization's Cognito configuration to determine region
    const cognitoConfig = await ddb.send(new GetItemCommand({
      TableName: CS_TABLE,
      Key: { orgId: { S: organizationId }, serviceType: { S: "aws-cognito" } }
    }));

    const region = cognitoConfig.Item?.region?.S || process.env.AWS_REGION || 'us-east-1';

    // Create Cognito client
    const cognitoClient = new CognitoIdentityProviderClient({
      region: region,
    });

    try {
      // Get user details from Cognito
      console.log(`👤 Getting user details from Cognito`);
      const getUserCommand = new GetUserCommand({
        AccessToken: tokens.access,
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

      // Check if this is the first user in the organization
      console.log(`🔍 Checking if user is first in organization`);
      const scanUsersCommand = new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression: "orgId = :orgId",
        ExpressionAttributeValues: {
          ":orgId": { S: organizationId }
        }
      });
      
      const existingUsers = await ddb.send(scanUsersCommand);
      const isFirstUser = !existingUsers.Items || existingUsers.Items.length === 0;
      
      // Determine role
      let role = "Security Analyst"; // Default role
      if (isFirstUser) {
        role = "Owner";
        console.log(`👑 First user detected, assigning Owner role`);
      }

      // Check if user already exists
      const getUserItemCommand = new GetItemCommand({
        TableName: USERS_TABLE,
        Key: {
          orgId: { S: organizationId },
          email: { S: userEmail }
        }
      });
      
      const existingUser = await ddb.send(getUserItemCommand);
      
      if (existingUser.Item) {
        // User exists, just update last login
        await ddb.send(new PutItemCommand({
          TableName: USERS_TABLE,
          Item: {
            orgId: { S: organizationId },
            email: { S: userEmail },
            name: { S: userName },
            role: existingUser.Item.role, // Keep existing role
            status: { S: "active" },
            lastLogin: { S: new Date().toISOString() },
            ...(existingUser.Item.addedAt && { addedAt: existingUser.Item.addedAt }),
            ...(existingUser.Item.isFounder && { isFounder: existingUser.Item.isFounder }),
          },
        }));
        
        console.log(`✅ Updated existing user: ${userEmail} with role: ${existingUser.Item.role.S}`);
        
        return NextResponse.json({
          success: true,
          message: "User login updated successfully",
          role: existingUser.Item.role.S,
          isFirstUser: false,
          organizationId,
          organizationName,
        });
      }

      // Add new user
      await ddb.send(new PutItemCommand({
        TableName: USERS_TABLE,
        Item: {
          orgId: { S: organizationId },
          email: { S: userEmail },
          name: { S: userName },
          role: { S: role },
          status: { S: "active" },
          addedAt: { S: new Date().toISOString() },
          lastLogin: { S: new Date().toISOString() },
          ...(isFirstUser && { isFounder: { BOOL: true } }),
        },
      }));
      
      console.log(`✅ Auto-registered new user: ${userEmail} with role: ${role}`);

      return NextResponse.json({
        success: true,
        message: "User registered successfully",
        role,
        isFirstUser,
        organizationId,
        organizationName,
      });

    } catch (cognitoError: any) {
      console.error(`❌ Cognito error during auto-registration:`, cognitoError);
      
      // Don't fail the login process for auto-registration errors
      return NextResponse.json({
        success: true,
        message: "Login successful, but user registration had issues",
        role: "Security Analyst",
        isFirstUser: false,
        organizationId,
        organizationName,
        warning: "Auto-registration partially failed",
      });
    }

  } catch (error: any) {
    console.error("❌ Auto-registration error:", error);
    
    // Don't fail the login for auto-registration errors
    return NextResponse.json({
      success: true,
      message: "Login successful, but auto-registration failed",
      role: "Security Analyst",
      isFirstUser: false,
      warning: "Auto-registration failed",
    });
  }
}