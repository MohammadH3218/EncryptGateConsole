// app/api/company-settings/users/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  PutItemCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

// Environment variables - Made optional for org-aware deployment
const DEFAULT_ORG_ID = process.env.ORGANIZATION_ID || 'default-org';
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || 
                 process.env.CLOUDSERVICES_TABLE || 
                 "CloudServices";
const USERS_TABLE = process.env.USERS_TABLE_NAME || "SecurityTeamUsers";

// Note: In production, ORG_ID should be extracted from request context
// This fallback is for backward compatibility during migration

// DynamoDB client with default credential provider chain
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });

async function getCognitoConfig(orgId: string) {
  console.log(`🔍 Fetching Cognito config for org ${orgId} from table ${CS_TABLE}`);

  try {
    const resp = await ddb.send(
      new GetItemCommand({
        TableName: CS_TABLE,
        Key: {
          orgId:       { S: orgId },
          serviceType: { S: "aws-cognito" },
        },
      })
    );

    if (!resp.Item) {
      console.error("❌ No AWS Cognito configuration found in Dynamo");
      throw new Error("No AWS Cognito configuration found. Please connect AWS Cognito first.");
    }

    const config = {
      userPoolId: resp.Item.userPoolId?.S!,
      region:     resp.Item.region?.S!,
    };

    console.log(`✅ Found Cognito config: UserPoolId=${config.userPoolId}, Region=${config.region}`);
    return config;
  } catch (err) {
    console.error("❌ Error fetching Cognito config:", err);
    throw err;
  }
}

// GET - list security team users (not all Cognito users)
export async function GET(req: Request) {
  console.log("🔍 GET /api/company-settings/users - Getting security team users");

  try {
    // Extract orgId from request headers
    const orgId = req.headers.get('x-org-id') || DEFAULT_ORG_ID;

    // Query our SecurityTeamUsers table instead of listing all Cognito users
    const resp = await ddb.send(
      new QueryCommand({
        TableName: USERS_TABLE,
        KeyConditionExpression: "orgId = :orgId",
        ExpressionAttributeValues: {
          ":orgId": { S: orgId },
        },
      })
    );

    const users = (resp.Items || []).map((item) => {
      console.log(`Processing security team user: ${item.email?.S}`);
      return {
        username:  item.email?.S?.split('@')[0] || "", // Username from email
        name:      item.name?.S || "",
        email:     item.email?.S || "",
        role:      item.role?.S || "",
        status:    item.status?.S || "active",
        lastLogin: item.lastLogin?.S || null,
      };
    });

    console.log(`✅ Returning ${users.length} security team users`);
    return NextResponse.json(users);
  } catch (err: any) {
    console.error("❌ [users:GET] Error details:", {
      message: err.message,
      name: err.name,
      code: err.code,
      stack: err.stack,
    });

    let statusCode = 500;
    let errorMessage = "Failed to list security team users";

    if (err.message.includes("No AWS Cognito configuration found")) {
      statusCode = 404;
      errorMessage = "AWS Cognito not configured. Please connect a Cognito service first.";
    }

    return NextResponse.json(
      {
        error: errorMessage,
        message: err.message,
        code: err.code || err.name,
      },
      { status: statusCode }
    );
  }
}

// POST - add a user to security team
export async function POST(req: Request) {
  let name: string | undefined;
  let email: string | undefined;
  let role: string | undefined;
  try {
    // Extract orgId from request headers
    const orgId = req.headers.get('x-org-id') || DEFAULT_ORG_ID;

    ({ name, email, role } = await req.json());
    if (!name || !email) {
      return NextResponse.json(
        { error: "Missing fields", required: ["name","email"] },
        { status: 400 }
      );
    }

    // Check if this is the first user in the organization
    const existingUsersResp = await ddb.send(
      new QueryCommand({
        TableName: USERS_TABLE,
        KeyConditionExpression: "orgId = :orgId",
        ExpressionAttributeValues: {
          ":orgId": { S: orgId },
        },
        Select: "COUNT"
      })
    );

    const isFirstUser = (existingUsersResp.Count || 0) === 0;

    // Set default role: Owner for first user, Viewer for others
    if (!role) {
      role = isFirstUser ? "Owner" : "Viewer";
      console.log(`🔧 Setting ${isFirstUser ? 'Owner (first user)' : 'Viewer (default)'} role for ${email}`);
    }

    console.log(`👤 Adding user to security team: ${email} with role ${role}`);

    const { userPoolId, region: cognitoRegion } = await getCognitoConfig(orgId);
    
    // Create Cognito client
    const cognito = new CognitoIdentityProviderClient({
      region: cognitoRegion,
    });

    // Check if user exists in Cognito and get their preferred_username
    let actualName = name; // Use provided name as fallback
    try {
      const userResp = await cognito.send(new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: email,
      }));
      
      // Extract preferred_username from user attributes if available
      const attributes = userResp.UserAttributes || [];
      const getAttributeValue = (attrName: string) => {
        const attr = attributes.find(a => a.Name === attrName);
        return attr?.Value || "";
      };
      
      // Prioritize preferred_username, then provided name, then other attributes
      actualName = getAttributeValue("preferred_username") || 
                   name || 
                   getAttributeValue("name") || 
                   getAttributeValue("given_name") + " " + getAttributeValue("family_name") ||
                   email.split("@")[0];
      
      console.log(`✅ User ${email} exists in Cognito with display name: ${actualName}`);
    } catch (cognitoError: any) {
      if (cognitoError.name === "UserNotFoundException") {
        return NextResponse.json(
          { error: "User not found in Cognito", message: "This user must exist in the Cognito user pool before being added to the security team." },
          { status: 404 }
        );
      }
      throw cognitoError;
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
      if (cognitoError.name === "GroupNotFoundException") {
        console.warn(`⚠️ Group ${role} not found in Cognito, continuing without group assignment`);
      } else {
        console.error("❌ Error adding user to Cognito group:", cognitoError);
        // Don't fail the entire operation if group assignment fails
      }
    }

    // Add user to our SecurityTeamUsers table
    await ddb.send(new PutItemCommand({
      TableName: USERS_TABLE,
      Item: {
        orgId:     { S: orgId },
        email:     { S: email },
        name:      { S: name },
        role:      { S: role },
        status:    { S: "active" },
        addedAt:   { S: new Date().toISOString() },
        lastLogin: { S: new Date().toISOString() }, // Default to now
      },
    }));

    console.log(`✅ User added to security team successfully: ${email}`);
    return NextResponse.json({
      username:  email.split('@')[0],
      name,
      email,
      role,
      status:    "active",
      lastLogin: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("❌ [users:POST]", err);
    
    let statusCode = 500;
    let errorMessage = "Failed to add user to security team";
    
    if (err.name === "ConditionalCheckFailedException") {
      statusCode = 409;
      errorMessage = "User already exists in security team";
    } else if (err.name === "InvalidParameterException") {
      statusCode = 400;
      errorMessage = "Invalid parameters provided";
    } else if (err.message.includes("No AWS Cognito configuration found")) {
      statusCode = 404;
      errorMessage = "AWS Cognito not configured";
    }
    
    return NextResponse.json(
      { 
        error: errorMessage, 
        message: err.message,
        code: err.code || err.name
      },
      { status: statusCode }
    );
  }
}

// Note: DELETE is handled in the [id]/route.ts file
// This export is just for consistency with the API structure