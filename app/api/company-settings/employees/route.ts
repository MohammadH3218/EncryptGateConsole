// app/api/company-settings/employees/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

// Environment variables
const ORG_ID = process.env.ORGANIZATION_ID!;
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || 
                 process.env.CLOUDSERVICES_TABLE || 
                 "CloudServices";
const EMPLOYEES_TABLE = process.env.EMPLOYEES_TABLE_NAME || "MonitoredEmployees";

if (!ORG_ID) throw new Error("Missing ORGANIZATION_ID env var");

console.log("🔧 Employees API starting with:", { ORG_ID, CS_TABLE, EMPLOYEES_TABLE });

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
          serviceType: { S: "employee-cognito" },
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

// GET - list monitored employees (not all pool users, just those being monitored)
export async function GET(req: Request) {
  console.log("🔍 GET /api/company-settings/employees - Getting monitored employees");
  
  try {
    // Query our MonitoredEmployees table
    const resp = await ddb.send(
      new QueryCommand({
        TableName: EMPLOYEES_TABLE,
        KeyConditionExpression: "orgId = :orgId",
        ExpressionAttributeValues: {
          ":orgId": { S: ORG_ID },
        },
      })
    );

    const employees = (resp.Items || []).map((item) => {
      console.log(`Processing monitored employee: ${item.email?.S}`);
      return {
        id:        item.email?.S!, // Use email as ID for consistency
        name:      item.name?.S || "",
        email:     item.email?.S || "",
        status:    item.status?.S || "active",
        addedAt:   item.addedAt?.S || null,
        lastEmailProcessed: item.lastEmailProcessed?.S || null,
      };
    });

    console.log(`✅ Returning ${employees.length} monitored employees`);
    return NextResponse.json(employees);
  } catch (err: any) {
    console.error("❌ [employees:GET] Error details:", {
      message: err.message,
      name: err.name,
      code: err.code,
      stack: err.stack,
    });
    
    let statusCode = 500;
    let errorMessage = "Failed to list monitored employees";
    
    if (err.message.includes("No Employee Cognito configuration found")) {
      statusCode = 404;
      errorMessage = "Employee Cognito not configured. Please connect an Employee Cognito service first.";
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

// POST - add an employee to monitoring
export async function POST(req: Request) {
  let name: string | undefined;
  let email: string | undefined;
  try {
    ({ name, email } = await req.json());
    if (!name || !email) {
      return NextResponse.json(
        { error: "Missing fields", required: ["name","email"] },
        { status: 400 }
      );
    }

    console.log(`👤 Adding employee to monitoring: ${email}`);

    const { userPoolId, region: cognitoRegion } = await getEmployeeCognitoConfig();
    
    // Create Cognito client
    const cognito = new CognitoIdentityProviderClient({
      region: cognitoRegion,
    });

    // Check if user exists in Employee Cognito pool
    try {
      const userDetails = await cognito.send(new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: email,
      }));
      console.log(`✅ Employee ${email} exists in Employee Cognito pool`);
      
      // Extract user attributes for display
      const attributes = userDetails.UserAttributes || [];
      const getAttributeValue = (name: string) => {
        const attr = attributes.find(a => a.Name === name);
        return attr?.Value || "";
      };
      
      const displayName = getAttributeValue("name") || 
                         getAttributeValue("given_name") + " " + getAttributeValue("family_name") ||
                         name;
      
    } catch (cognitoError: any) {
      if (cognitoError.name === "UserNotFoundException") {
        return NextResponse.json(
          { error: "Employee not found in Cognito", message: "This employee must exist in the Employee Cognito user pool before being added to monitoring." },
          { status: 404 }
        );
      }
      throw cognitoError;
    }

    // Add employee to our MonitoredEmployees table
    await ddb.send(new PutItemCommand({
      TableName: EMPLOYEES_TABLE,
      Item: {
        orgId:     { S: ORG_ID },
        email:     { S: email },
        name:      { S: name },
        status:    { S: "active" },
        addedAt:   { S: new Date().toISOString() },
        lastEmailProcessed: { S: new Date().toISOString() }, // Default to now
      },
    }));

    console.log(`✅ Employee added to monitoring successfully: ${email}`);
    return NextResponse.json({
      id:        email,
      name,
      email,
      status:    "active",
      addedAt:   new Date().toISOString(),
      lastEmailProcessed: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("❌ [employees:POST]", err);
    
    let statusCode = 500;
    let errorMessage = "Failed to add employee to monitoring";
    
    if (err.name === "ConditionalCheckFailedException") {
      statusCode = 409;
      errorMessage = "Employee already being monitored";
    } else if (err.name === "InvalidParameterException") {
      statusCode = 400;
      errorMessage = "Invalid parameters provided";
    } else if (err.message.includes("No Employee Cognito configuration found")) {
      statusCode = 404;
      errorMessage = "Employee Cognito not configured";
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