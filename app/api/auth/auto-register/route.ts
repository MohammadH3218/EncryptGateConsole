// app/api/auth/auto-register/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

// Environment variables
const ORG_ID = process.env.ORGANIZATION_ID!;
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || 
                 process.env.CLOUDSERVICES_TABLE || 
                 "CloudServices";
const USERS_TABLE = process.env.USERS_TABLE_NAME || "SecurityTeamUsers";

if (!ORG_ID) throw new Error("Missing ORGANIZATION_ID env var");

// DynamoDB client with default credential provider chain
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });

async function getCognitoConfig() {
  try {
    const resp = await ddb.send(
      new GetItemCommand({
        TableName: CS_TABLE,
        Key: {
          orgId:       { S: ORG_ID },
          serviceType: { S: "aws-cognito" },
        },
      })
    );
    
    if (!resp.Item) {
      throw new Error("No AWS Cognito configuration found. Please connect AWS Cognito first.");
    }
    
    return {
      userPoolId: resp.Item.userPoolId?.S!,
      region:     resp.Item.region?.S!,
    };
  } catch (err) {
    console.error("❌ Error fetching Cognito config:", err);
    throw err;
  }
}

// POST - Auto-register user during authentication
export async function POST(req: Request) {
  try {
    const { email, tokens } = await req.json();
    
    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    console.log(`🔄 Auto-registering user: ${email}`);

    // Check if user already exists in security team
    const existingUserResp = await ddb.send(
      new GetItemCommand({
        TableName: USERS_TABLE,
        Key: {
          orgId: { S: ORG_ID },
          email: { S: email },
        },
      })
    );

    if (existingUserResp.Item) {
      console.log(`✅ User ${email} already exists in security team`);
      return NextResponse.json({ 
        message: "User already registered", 
        role: existingUserResp.Item.role?.S || "Viewer"
      });
    }

    // Check if this is the first user in the organization
    const existingUsersResp = await ddb.send(
      new QueryCommand({
        TableName: USERS_TABLE,
        KeyConditionExpression: "orgId = :orgId",
        ExpressionAttributeValues: {
          ":orgId": { S: ORG_ID },
        },
        Select: "COUNT"
      })
    );

    const isFirstUser = (existingUsersResp.Count || 0) === 0;
    const role = isFirstUser ? "Owner" : "Viewer";
    
    console.log(`🔧 Setting ${isFirstUser ? 'Owner (first user)' : 'Viewer (default)'} role for ${email}`);

    const { userPoolId, region: cognitoRegion } = await getCognitoConfig();
    
    // Create Cognito client
    const cognito = new CognitoIdentityProviderClient({
      region: cognitoRegion,
    });

    // Get user info from Cognito
    let actualName = email.split("@")[0]; // Default fallback
    try {
      const userResp = await cognito.send(new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: email,
      }));
      
      // Extract name from user attributes
      const attributes = userResp.UserAttributes || [];
      const getAttributeValue = (attrName: string) => {
        const attr = attributes.find(a => a.Name === attrName);
        return attr?.Value || "";
      };
      
      // Prioritize preferred_username, then other name attributes
      actualName = getAttributeValue("preferred_username") || 
                   getAttributeValue("name") || 
                   getAttributeValue("given_name") + " " + getAttributeValue("family_name") ||
                   actualName;
      
      console.log(`✅ User ${email} found in Cognito with display name: ${actualName}`);
    } catch (cognitoError: any) {
      console.warn(`⚠️ Could not get user info from Cognito: ${cognitoError.message}`);
    }

    // Add user to role group in Cognito
    try {
      await cognito.send(new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: email,
        GroupName: role,
      }));
      console.log(`👥 Added user to Cognito group: ${role}`);
    } catch (cognitoError: any) {
      console.warn(`⚠️ Could not add user to Cognito group: ${cognitoError.message}`);
      // Continue even if group assignment fails
    }

    // Add user to our SecurityTeamUsers table
    await ddb.send(new PutItemCommand({
      TableName: USERS_TABLE,
      Item: {
        orgId:     { S: ORG_ID },
        email:     { S: email },
        name:      { S: actualName },
        role:      { S: role },
        status:    { S: "active" },
        addedAt:   { S: new Date().toISOString() },
        lastLogin: { S: new Date().toISOString() },
        autoRegistered: { BOOL: true }, // Mark as auto-registered
      },
    }));

    console.log(`✅ User auto-registered successfully: ${email} as ${role}`);
    return NextResponse.json({
      id:        email,
      name:      actualName,
      email,
      role,
      status:    "active",
      lastLogin: new Date().toISOString(),
      isFirstUser
    });
  } catch (err: any) {
    console.error("❌ [auto-register:POST]", err);
    
    return NextResponse.json(
      { 
        error: "Auto-registration failed", 
        message: err.message,
        code: err.code || err.name
      },
      { status: 500 }
    );
  }
}