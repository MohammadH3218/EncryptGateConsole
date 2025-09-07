// app/api/company-settings/users/[id]/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  GetItemCommand,
  DeleteItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CognitoIdentityProviderClient,
  AdminRemoveUserFromGroupCommand,
  AdminAddUserToGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";

// Environment variables - Made optional for org-aware deployment
const DEFAULT_ORG_ID = process.env.ORGANIZATION_ID || 'default-org';
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || 
                 process.env.CLOUDSERVICES_TABLE || 
                 "CloudServices";
const USERS_TABLE = process.env.USERS_TABLE_NAME || "SecurityTeamUsers";

// Note: In production, DEFAULT_ORG_ID should be extracted from request context

console.log("🔧 Users [id] API starting with:", { DEFAULT_ORG_ID, CS_TABLE, USERS_TABLE });

// DynamoDB client with default credential provider chain
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });

async function getCognitoConfig() {
  console.log(`🔍 Fetching Cognito config for org ${DEFAULT_ORG_ID} from table ${CS_TABLE}`);
  
  const resp = await ddb.send(
    new GetItemCommand({
      TableName: CS_TABLE,
      Key: {
        orgId:       { S: DEFAULT_ORG_ID },
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
}

// PATCH - update user role
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const email = decodeURIComponent(params.id);
    const { roleIds } = await req.json();
    const newRole = Array.isArray(roleIds) && roleIds.length > 0 ? roleIds[0] : undefined;
    
    if (!newRole) {
      return NextResponse.json(
        { error: "roleIds must contain at least one role ID" },
        { status: 400 }
      );
    }
    
    console.log(`🔄 Updating user role: ${email} -> ${newRole}`);
    
    // Get current user info
    const userResp = await ddb.send(new GetItemCommand({
      TableName: USERS_TABLE,
      Key: {
        orgId: { S: DEFAULT_ORG_ID },
        email: { S: email },
      },
    }));

    if (!userResp.Item) {
      console.warn(`⚠️ User not found: ${email}`);
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const currentRole = userResp.Item.role?.S;
    console.log(`👤 Current role: ${currentRole}, New role: ${newRole}`);
    
    const { userPoolId, region: cognitoRegion } = await getCognitoConfig();

    // Create Cognito client
    const cognito = new CognitoIdentityProviderClient({
      region: cognitoRegion,
    });

    // Remove user from current role group in Cognito
    if (currentRole && currentRole !== newRole) {
      try {
        await cognito.send(new AdminRemoveUserFromGroupCommand({
          UserPoolId: userPoolId,
          Username: email,
          GroupName: currentRole,
        }));
        console.log(`👥 Removed user from Cognito group: ${currentRole}`);
      } catch (cognitoError: any) {
        console.warn(`⚠️ Could not remove user from Cognito group: ${cognitoError.message}`);
        // Continue even if group removal fails
      }
    }

    // Add user to new role group in Cognito
    try {
      await cognito.send(new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: email,
        GroupName: newRole,
      }));
      console.log(`👥 Added user to Cognito group: ${newRole}`);
    } catch (cognitoError: any) {
      console.warn(`⚠️ Could not add user to Cognito group: ${cognitoError.message}`);
      // Continue even if group addition fails
    }

    // Update role in our SecurityTeamUsers table
    await ddb.send(new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: {
        orgId: { S: DEFAULT_ORG_ID },
        email: { S: email },
      },
      UpdateExpression: "SET #role = :role, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#role": "role"
      },
      ExpressionAttributeValues: {
        ":role": { S: newRole },
        ":updatedAt": { S: new Date().toISOString() }
      },
    }));

    console.log(`✅ User role updated successfully: ${email} -> ${newRole}`);
    return NextResponse.json({ success: true, role: newRole });
  } catch (err: any) {
    console.error("❌ [users:PATCH]", err);
    
    let statusCode = 500;
    let errorMessage = "Failed to update user role";
    
    if (err.name === "ResourceNotFoundException") {
      statusCode = 404;
      errorMessage = "User not found";
    } else if (err.message.includes("No AWS Cognito configuration found")) {
      statusCode = 404;
      errorMessage = "AWS Cognito not configured";
    } else if (err.name === "NotAuthorizedException") {
      statusCode = 403;
      errorMessage = "Not authorized to access Cognito";
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

// DELETE - remove a user from security team
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const email = decodeURIComponent(params.id);
    console.log(`🗑️ Removing user from security team: ${email}`);
    
    // Get user info first to know their role
    const userResp = await ddb.send(new GetItemCommand({
      TableName: USERS_TABLE,
      Key: {
        orgId: { S: DEFAULT_ORG_ID },
        email: { S: email },
      },
    }));

    if (!userResp.Item) {
      console.warn(`⚠️ User not found in security team: ${email}`);
      return NextResponse.json(
        { error: "User not found in security team" },
        { status: 404 }
      );
    }

    const userRole = userResp.Item.role?.S;
    console.log(`👤 Found user with role: ${userRole}`);
    
    const { userPoolId, region: cognitoRegion } = await getCognitoConfig();

    // Create Cognito client
    const cognito = new CognitoIdentityProviderClient({
      region: cognitoRegion,
    });

    // Remove user from their role group in Cognito
    if (userRole) {
      try {
        await cognito.send(new AdminRemoveUserFromGroupCommand({
          UserPoolId: userPoolId,
          Username: email,
          GroupName: userRole,
        }));
        console.log(`👥 Removed user from Cognito group: ${userRole}`);
      } catch (cognitoError: any) {
        console.warn(`⚠️ Could not remove user from Cognito group: ${cognitoError.message}`);
        // Continue even if group removal fails
      }
    }

    // Remove from our SecurityTeamUsers table
    await ddb.send(new DeleteItemCommand({
      TableName: USERS_TABLE,
      Key: {
        orgId: { S: DEFAULT_ORG_ID },
        email: { S: email },
      },
    }));

    console.log(`✅ User removed from security team successfully: ${email}`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("❌ [users:DELETE]", err);
    
    let statusCode = 500;
    let errorMessage = "Failed to remove user from security team";
    
    if (err.name === "ResourceNotFoundException") {
      statusCode = 404;
      errorMessage = "User not found in security team";
    } else if (err.message.includes("No AWS Cognito configuration found")) {
      statusCode = 404;
      errorMessage = "AWS Cognito not configured";
    } else if (err.name === "NotAuthorizedException") {
      statusCode = 403;
      errorMessage = "Not authorized to access Cognito";
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