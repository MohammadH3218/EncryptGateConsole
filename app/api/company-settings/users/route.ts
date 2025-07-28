// app/api/company-settings/users/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminDeleteUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

// Only use ORG_ID and table name from env vars
const ORG_ID = process.env.ORGANIZATION_ID!;
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || 
                 process.env.CLOUDSERVICES_TABLE || 
                 "CloudServices";

if (!ORG_ID) throw new Error("Missing ORGANIZATION_ID env var");

// DynamoDB client with default credential provider chain
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });

async function getCognitoConfig() {
  console.log(`🔍 Fetching Cognito config for org ${ORG_ID} from table ${CS_TABLE}`);
  
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

//—— 3) GET — list users ——
export async function GET(req: Request) {
  console.log("🔍 GET /api/company-settings/users - Starting request");
  
  try {
    const { userPoolId, region: cognitoRegion } = await getCognitoConfig();
    
    console.log(`🔧 Creating Cognito client for region ${cognitoRegion}`);
    // Create Cognito client using default credential provider
    const cognito = new CognitoIdentityProviderClient({
      region: cognitoRegion,
    });

    console.log(`📋 Listing users from UserPoolId: ${userPoolId}`);
    const resp = await cognito.send(
      new ListUsersCommand({ UserPoolId: userPoolId })
    );

    const users = (resp.Users || []).map((u) => {
      console.log(`Processing user: ${u.Username}`);
      return {
        id:        u.Username!,
        name:      u.Attributes?.find(a => a.Name === "name")?.Value || "",
        email:     u.Attributes?.find(a => a.Name === "email")?.Value || "",
        role:      u.Attributes?.find(a => a.Name === "custom:role")?.Value || "",
        status:    (u.UserStatus || "").toLowerCase(),
        lastLogin: u.UserLastModifiedDate?.toISOString() || null,
      };
    });

    console.log(`✅ Returning ${users.length} users`);
    return NextResponse.json(users);
  } catch (err: any) {
    // Enhance error logging
    console.error("❌ [users:GET] Error details:", {
      message: err.message,
      name: err.name,
      code: err.code,
      stack: err.stack,
    });
    
    // Provide more helpful error messages
    let statusCode = 500;
    let errorMessage = "Failed to list users";
    
    if (err.name === "UserPoolNotFoundException") {
      statusCode = 404;
      errorMessage = "User Pool not found. Please verify your Cognito configuration.";
    } else if (err.name === "NotAuthorizedException") {
      statusCode = 403;
      errorMessage = "Not authorized to access Cognito. Please check your AWS credentials.";
    } else if (err.message.includes("No AWS Cognito configuration found")) {
      statusCode = 404;
      errorMessage = "AWS Cognito not configured. Please connect a Cognito service first.";
    }
    
    return NextResponse.json(
      { 
        error: errorMessage, 
        message: err.message,
        code: err.code || err.name,
        // Include a troubleshooting tip
        tip: "Try refreshing your AWS Cognito connection or checking your AWS credentials."
      },
      { status: statusCode }
    );
  }
}

//—— 4) POST — create a new user & add to group ——
export async function POST(req: Request) {
  let name: string | undefined;
  let email: string | undefined;
  let role: string | undefined;
  try {
    ({ name, email, role } = await req.json());
    if (!name || !email || !role) {
      return NextResponse.json(
        { error: "Missing fields", required: ["name","email","role"] },
        { status: 400 }
      );
    }

    const { userPoolId, region: cognitoRegion } = await getCognitoConfig();
    console.log(`🔧 Creating Cognito client for region ${cognitoRegion}`);
    // Create Cognito client using default credential provider
    const cognito = new CognitoIdentityProviderClient({
      region: cognitoRegion,
    });

    console.log(`👤 Creating user: ${email}`);
    // create user
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: [
        { Name: "name",  Value: name  },
        { Name: "email", Value: email },
        { Name: "email_verified", Value: "true" },
        { Name: "custom:role", Value: role },
      ],
      MessageAction: "SUPPRESS",
    }));

    console.log(`👥 Adding user to group: ${role}`);
    // add to role group
    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: email,
      GroupName: role,
    }));

    console.log(`✅ User created successfully: ${email}`);
    return NextResponse.json({
      id:        email,
      name,
      email,
      role,
      status:    "pending",
      lastLogin: null,
    });
  } catch (err: any) {
    console.error("❌ [users:POST]", err);
    
    // Provide better error messages for common scenarios
    let statusCode = 500;
    let errorMessage = "Failed to create user";
    
    if (err.name === "UsernameExistsException") {
      statusCode = 409; // Conflict
      errorMessage = "A user with this email already exists";
    } else if (err.name === "InvalidParameterException") {
      statusCode = 400;
      errorMessage = "Invalid parameters provided";
    } else if (err.name === "GroupNotFoundException") {
      statusCode = 404;
      errorMessage = `The role group "${role ?? ''}" does not exist in Cognito`;
    } else if (err.name === "LimitExceededException") {
      statusCode = 429; // Too Many Requests
      errorMessage = "AWS Cognito user limit has been reached";
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

//—— 5) DELETE — remove a user entirely ——
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const username = decodeURIComponent(params.id);
    console.log(`🗑️ Deleting user: ${username}`);
    
    const { userPoolId, region: cognitoRegion } = await getCognitoConfig();
    console.log(`🔧 Creating Cognito client for region ${cognitoRegion}`);

    // Create Cognito client using default credential provider
    const cognito = new CognitoIdentityProviderClient({
      region: cognitoRegion,
    });

    await cognito.send(new AdminDeleteUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    }));

    console.log(`✅ User deleted successfully: ${username}`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("❌ [users:DELETE]", err);
    
    // Provide better error messages for common scenarios
    let statusCode = 500;
    let errorMessage = "Failed to delete user";
    
    if (err.name === "UserNotFoundException") {
      statusCode = 404;
      errorMessage = "User not found";
    } else if (err.name === "NotAuthorizedException") {
      statusCode = 403;
      errorMessage = "Not authorized to delete this user";
    } else if (err.name === "ResourceNotFoundException") {
      statusCode = 404;
      errorMessage = "User or User Pool not found";
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