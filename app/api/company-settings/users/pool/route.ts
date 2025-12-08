// app/api/company-settings/users/pool/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";

// Environment variables
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || 
                 process.env.CLOUDSERVICES_TABLE || 
                 "CloudServices";

console.log("🔧 Pool Users API starting with table:", CS_TABLE);

// DynamoDB client - use explicit credentials if available (for local dev)
function getDynamoDBClient() {
  const region = process.env.AWS_REGION || 'us-east-1';
  if (process.env.ACCESS_KEY_ID && process.env.SECRET_ACCESS_KEY) {
    return new DynamoDBClient({
      region,
      credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID,
        secretAccessKey: process.env.SECRET_ACCESS_KEY,
      },
    });
  }
  return new DynamoDBClient({ region });
}

const ddb = getDynamoDBClient();

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

// GET - list all users in the Cognito user pool
export async function GET(req: Request) {
  console.log("🔍 GET /api/company-settings/users/pool - Getting all Cognito pool users");
  
  try {
    // Extract orgId from request headers
    const orgId = req.headers.get('x-org-id');

    if (!orgId) {
      return NextResponse.json(
        { error: "Organization ID not found in headers" },
        { status: 400 }
      );
    }

    const { userPoolId, region: cognitoRegion } = await getCognitoConfig(orgId);
    
    // Create Cognito client
    const cognito = new CognitoIdentityProviderClient({
      region: cognitoRegion,
    });

    console.log(`📋 Listing users from Cognito pool: ${userPoolId}`);
    
    // List users in the pool
    const response = await cognito.send(new ListUsersCommand({
      UserPoolId: userPoolId,
      Limit: 60, // Adjust as needed, max is 60 per request
    }));

    const users = (response.Users || []).map(user => {
      // Extract user attributes
      const attributes = user.Attributes || [];
      const getAttributeValue = (name: string) => {
        const attr = attributes.find(a => a.Name === name);
        return attr?.Value || "";
      };

      const email = getAttributeValue("email");
      const name = getAttributeValue("preferred_username") || 
                   getAttributeValue("name") || 
                   getAttributeValue("given_name") + " " + getAttributeValue("family_name") ||
                   email.split("@")[0]; // fallback to email username

      return {
        username: user.Username || "",
        name: name.trim() || "Unknown User",
        email: email,
      };
    }).filter(user => user.email); // Only include users with email addresses

    console.log(`✅ Returning ${users.length} pool users`);
    return NextResponse.json(users);
  } catch (err: any) {
    console.error("❌ [pool users:GET] Error details:", {
      message: err.message,
      name: err.name,
      code: err.code,
      stack: err.stack,
    });
    
    let statusCode = 500;
    let errorMessage = "Failed to list Cognito pool users";
    
    if (err.message.includes("No AWS Cognito configuration found")) {
      statusCode = 404;
      errorMessage = "AWS Cognito not configured. Please connect a Cognito service first.";
    } else if (err.name === "NotAuthorizedException") {
      statusCode = 403;
      errorMessage = "Not authorized to access Cognito user pool";
    } else if (err.name === "ResourceNotFoundException") {
      statusCode = 404;
      errorMessage = "Cognito user pool not found";
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