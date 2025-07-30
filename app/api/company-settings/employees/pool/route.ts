// app/api/company-settings/employees/pool/route.ts
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
const ORG_ID = process.env.ORGANIZATION_ID!;
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || 
                 process.env.CLOUDSERVICES_TABLE || 
                 "CloudServices";

if (!ORG_ID) throw new Error("Missing ORGANIZATION_ID env var");

console.log("🔧 Employee Pool Users API starting with:", { ORG_ID, CS_TABLE });

// DynamoDB client with default credential provider chain
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });

async function getEmployeeCognitoConfig() {
  console.log(`🔍 Fetching Employee Cognito config for org ${ORG_ID} from table ${CS_TABLE}`);
  
  try {
    const resp = await ddb.send(
      new GetItemCommand({
        TableName: CS_TABLE,
        Key: {
          orgId:       { S: ORG_ID },
          serviceType: { S: "employee-cognito" }, // Different service type for employees
        },
      })
    );
    
    if (!resp.Item) {
      console.error("❌ No Employee Cognito configuration found in Dynamo");
      throw new Error("No Employee Cognito configuration found. Please connect Employee Cognito first.");
    }
    
    const config = {
      userPoolId: resp.Item.userPoolId?.S!,
      region:     resp.Item.region?.S!,
    };
    
    console.log(`✅ Found Employee Cognito config: UserPoolId=${config.userPoolId}, Region=${config.region}`);
    return config;
  } catch (err) {
    console.error("❌ Error fetching Employee Cognito config:", err);
    throw err;
  }
}

// GET - list all users in the Employee Cognito user pool
export async function GET(req: Request) {
  console.log("🔍 GET /api/company-settings/employees/pool - Getting all Employee Cognito pool users");
  
  try {
    const { userPoolId, region: cognitoRegion } = await getEmployeeCognitoConfig();
    
    // Create Cognito client
    const cognito = new CognitoIdentityProviderClient({
      region: cognitoRegion,
    });

    console.log(`📋 Listing employee users from Cognito pool: ${userPoolId}`);
    
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
      const name = getAttributeValue("name") || 
                   getAttributeValue("given_name") + " " + getAttributeValue("family_name") ||
                   email.split("@")[0]; // fallback to email username

      return {
        username: user.Username || "",
        name: name.trim() || "Unknown User",
        email: email,
        status: user.UserStatus || "UNKNOWN",
        enabled: user.Enabled || false,
      };
    }).filter(user => user.email); // Only include users with email addresses

    console.log(`✅ Returning ${users.length} employee pool users`);
    return NextResponse.json(users);
  } catch (err: any) {
    console.error("❌ [employee pool users:GET] Error details:", {
      message: err.message,
      name: err.name,
      code: err.code,
      stack: err.stack,
    });
    
    let statusCode = 500;
    let errorMessage = "Failed to list Employee Cognito pool users";
    
    if (err.message.includes("No Employee Cognito configuration found")) {
      statusCode = 404;
      errorMessage = "Employee Cognito not configured. Please connect an Employee Cognito service first.";
    } else if (err.name === "NotAuthorizedException") {
      statusCode = 403;
      errorMessage = "Not authorized to access Employee Cognito user pool";
    } else if (err.name === "ResourceNotFoundException") {
      statusCode = 404;
      errorMessage = "Employee Cognito user pool not found";
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