// app/api/company-settings/employees/workmail-users/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import {
  WorkMailClient,
  ListUsersCommand,
  DescribeUserCommand,
} from "@aws-sdk/client-workmail";

// Environment variables
const ORG_ID = process.env.ORGANIZATION_ID!;
const EMPLOYEES_TABLE = process.env.EMPLOYEES_TABLE_NAME || "Employees";
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || 
                 process.env.CLOUDSERVICES_TABLE || 
                 "CloudServices";

if (!ORG_ID) throw new Error("Missing ORGANIZATION_ID env var");

console.log("🔧 WorkMail Users API starting with:", { ORG_ID, EMPLOYEES_TABLE, CS_TABLE });

// DynamoDB client with default credential provider chain
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });

// Helper function to get WorkMail configuration from DynamoDB
async function getWorkMailConfig() {
  console.log(`🔍 Fetching WorkMail config for org ${ORG_ID} from table ${CS_TABLE}`);
  
  try {
    const resp = await ddb.send(
      new GetItemCommand({
        TableName: CS_TABLE,
        Key: {
          orgId:       { S: ORG_ID },
          serviceType: { S: "aws-workmail" },
        },
      })
    );
    
    if (!resp.Item) {
      console.error("❌ No AWS WorkMail configuration found in DynamoDB");
      throw new Error("No AWS WorkMail configuration found. Please connect AWS WorkMail first.");
    }
    
    const config = {
      organizationId: resp.Item.organizationId?.S!,
      region:         resp.Item.region?.S!,
      alias:          resp.Item.alias?.S || '',
    };
    
    console.log(`✅ Found WorkMail config: OrganizationId=${config.organizationId}, Region=${config.region}`);
    return config;
  } catch (err) {
    console.error("❌ Error fetching WorkMail config:", err);
    throw err;
  }
}

// Helper function to get currently monitored employees
async function getMonitoredEmployeeEmails() {
  try {
    const resp = await ddb.send(
      new QueryCommand({
        TableName: EMPLOYEES_TABLE,
        KeyConditionExpression: 'orgId = :orgId',
        ExpressionAttributeValues: {
          ':orgId': { S: ORG_ID },
        },
        ProjectionExpression: 'email', // Only get emails to filter out already monitored users
      })
    );

    return new Set((resp.Items || []).map(item => item.email?.S).filter(Boolean));
  } catch (err) {
    console.error("❌ Error fetching monitored employees:", err);
    return new Set<string>();
  }
}

// GET - list all WorkMail users that aren't already being monitored
export async function GET(req: Request) {
  console.log("🔍 GET /api/company-settings/employees/workmail-users - Getting available WorkMail users");
  
  try {
    // Get WorkMail configuration from DynamoDB
    const { organizationId, region: workmailRegion } = await getWorkMailConfig();
    
    // Get currently monitored employees to filter them out
    const monitoredEmails = await getMonitoredEmployeeEmails();
    console.log(`📋 Found ${monitoredEmails.size} already monitored employees`);
    
    // Create WorkMail client with the region from config
    const workmail = new WorkMailClient({ region: workmailRegion });

    console.log(`📋 Listing users from WorkMail org: ${organizationId}`);
    
    // List users in the WorkMail organization
    const response = await workmail.send(new ListUsersCommand({
      OrganizationId: organizationId,
      MaxResults: 100, // Adjust as needed
    }));

    const availableUsers = [];
    const errors = [];

    // Get detailed info for each user and filter out already monitored ones
    for (const user of response.Users || []) {
      try {
        if (!user.Id || user.State !== 'ENABLED') {
          continue; // Skip disabled users
        }

        // Get detailed user information
        const userDetails = await workmail.send(new DescribeUserCommand({
          OrganizationId: organizationId,
          UserId: user.Id
        }));

        if (userDetails.Email && !monitoredEmails.has(userDetails.Email)) {
          availableUsers.push({
            id: user.Id,
            name: userDetails.DisplayName || userDetails.Name || 'Unknown User',
            email: userDetails.Email,
            department: userDetails.Department || '',
            jobTitle: userDetails.JobTitle || '',
            state: user.State || 'ENABLED',
          });
        }
      } catch (userError: any) {
        console.error(`Error getting details for user ${user.Id}:`, userError);
        errors.push(`Failed to get details for user ${user.Name}: ${userError.message}`);
      }
    }

    console.log(`✅ Returning ${availableUsers.length} available WorkMail users (${monitoredEmails.size} already monitored)`);
    
    if (errors.length > 0) {
      console.warn(`⚠️ Had ${errors.length} errors fetching user details`);
    }

    return NextResponse.json(availableUsers);
  } catch (err: any) {
    console.error("❌ [workmail users:GET] Error details:", {
      message: err.message,
      name: err.name,
      code: err.code,
      stack: err.stack,
    });
    
    let statusCode = 500;
    let errorMessage = "Failed to list WorkMail users";
    
    if (err.message.includes("No AWS WorkMail configuration found")) {
      statusCode = 404;
      errorMessage = "AWS WorkMail not configured. Please connect WorkMail first.";
    } else if (err.name === "OrganizationNotFoundException") {
      statusCode = 404;
      errorMessage = "WorkMail organization not found";
    } else if (err.name === "NotAuthorizedException" || err.name === "AccessDeniedException") {
      statusCode = 403;
      errorMessage = "Not authorized to access WorkMail users";
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