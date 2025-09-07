// app/api/company-settings/employees/sync-workmail/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { 
  DynamoDBClient, 
  BatchWriteItemCommand, 
  GetItemCommand 
} from "@aws-sdk/client-dynamodb";
import { 
  WorkMailClient, 
  ListUsersCommand, 
  DescribeUserCommand,
  DescribeOrganizationCommand 
} from "@aws-sdk/client-workmail";

// Environment variables
const DEFAULT_ORG_ID = process.env.ORGANIZATION_ID || 'default-org';
const EMPLOYEES_TABLE = process.env.EMPLOYEES_TABLE_NAME || "Employees";
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || 
                 process.env.CLOUDSERVICES_TABLE || 
                 "CloudServices";

// Note: In production, ORG_ID should be extracted from request context

console.log("🔧 WorkMail Sync API starting with:", { DEFAULT_ORG_ID, EMPLOYEES_TABLE, CS_TABLE });

// DynamoDB client with default credential provider chain
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });

// Helper function to get WorkMail configuration from DynamoDB
async function getWorkMailConfig() {
  console.log(`🔍 Fetching WorkMail config for org ${DEFAULT_ORG_ID} from table ${CS_TABLE}`);
  
  try {
    const resp = await ddb.send(
      new GetItemCommand({
        TableName: CS_TABLE,
        Key: {
          orgId:       { S: DEFAULT_ORG_ID },
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

export async function POST(req: Request) {
  try {
    console.log("🔄 Syncing employees from AWS WorkMail...");

    // Get WorkMail configuration from DynamoDB
    const { organizationId, region: workmailRegion, alias } = await getWorkMailConfig();
    
    // Create WorkMail client with the region from config
    const workmail = new WorkMailClient({ region: workmailRegion });

    // List all users in WorkMail organization
    const listUsersResponse = await workmail.send(new ListUsersCommand({
      OrganizationId: organizationId,
      MaxResults: 100 // Adjust as needed
    }));

    if (!listUsersResponse.Users) {
      return NextResponse.json(
        { error: "No users found in WorkMail organization" },
        { status: 404 }
      );
    }

    console.log(`📧 Found ${listUsersResponse.Users.length} WorkMail users`);

    const employees = [];
    const errors = [];

    // Get detailed info for each user
    for (const user of listUsersResponse.Users) {
      try {
        if (!user.Id || user.State !== 'ENABLED') {
          continue; // Skip disabled users
        }

        const userDetails = await workmail.send(new DescribeUserCommand({
          OrganizationId: organizationId,
          UserId: user.Id
        }));

        if (userDetails.Email) {
          employees.push({
            name: userDetails.DisplayName || userDetails.Name || 'Unknown User',
            email: userDetails.Email,
            department: userDetails.Department || '',
            jobTitle: userDetails.JobTitle || '',
            workMailUserId: user.Id,
            status: 'active'
          });
        }
      } catch (userError: any) {
        console.error(`Error getting details for user ${user.Id}:`, userError);
        errors.push(`Failed to get details for user ${user.Name}: ${userError.message}`);
      }
    }

    console.log(`✅ Processed ${employees.length} valid employees`);

    // Batch write to DynamoDB
    if (employees.length > 0) {
      const batches = [];
      for (let i = 0; i < employees.length; i += 25) {
        batches.push(employees.slice(i, i + 25));
      }

      let successCount = 0;
      for (const batch of batches) {
        try {
          const putRequests = batch.map(emp => ({
            PutRequest: {
              Item: {
                orgId: { S: DEFAULT_ORG_ID },
                email: { S: emp.email },
                name: { S: emp.name },
                department: { S: emp.department },
                jobTitle: { S: emp.jobTitle },
                workMailUserId: { S: emp.workMailUserId },
                status: { S: "active" },
                addedAt: { S: new Date().toISOString() },
                lastEmailProcessed: { S: new Date().toISOString() },
                syncedFromWorkMail: { S: new Date().toISOString() },
              }
            }
          }));

          await ddb.send(new BatchWriteItemCommand({
            RequestItems: {
              [EMPLOYEES_TABLE]: putRequests
            }
          }));

          successCount += batch.length;
        } catch (batchError: any) {
          console.error("Batch write error:", batchError);
          errors.push(`Failed to save batch: ${batchError.message}`);
        }
      }

      console.log(`🎉 Successfully synced ${successCount}/${employees.length} employees from WorkMail`);

      return NextResponse.json({
        success: true,
        synced: successCount,
        total: employees.length,
        errors,
        organizationId,
        organizationAlias: alias
      });
    }

    return NextResponse.json({
      success: true,
      synced: 0,
      total: 0,
      message: "No valid employees found to sync"
    });

  } catch (err: any) {
    console.error("❌ WorkMail sync error:", err);
    
    let errorMessage = "Failed to sync from WorkMail";
    let statusCode = 500;
    
    if (err.message.includes("No AWS WorkMail configuration found")) {
      statusCode = 404;
      errorMessage = "AWS WorkMail not configured. Please connect AWS WorkMail first.";
    } else if (err.name === "OrganizationNotFoundException") {
      errorMessage = "WorkMail organization not found. Check your WorkMail configuration.";
      statusCode = 404;
    } else if (err.name === "UnauthorizedOperation" || err.name === "AccessDeniedException") {
      errorMessage = "Not authorized to access WorkMail. Check IAM permissions.";
      statusCode = 403;
    }
    
    return NextResponse.json(
      { 
        error: errorMessage, 
        message: err.message,
        code: err.name
      },
      { status: statusCode }
    );
  }
}

// GET - Check WorkMail connection status
export async function GET(req: Request) {
  try {
    // Get WorkMail configuration from DynamoDB
    const { organizationId, region: workmailRegion, alias } = await getWorkMailConfig();
    
    // Create WorkMail client with the region from config
    const workmail = new WorkMailClient({ region: workmailRegion });

    // Test connection by describing the organization
    const orgResponse = await workmail.send(new DescribeOrganizationCommand({
      OrganizationId: organizationId
    }));

    return NextResponse.json({
      connected: true,
      organizationId: organizationId,
      organizationAlias: orgResponse.Alias || alias,
      organizationState: orgResponse.State
    });

  } catch (err: any) {
    console.error("❌ WorkMail connection test error:", err);
    
    let errorMessage = "WorkMail connection failed";
    let connected = false;
    
    if (err.message.includes("No AWS WorkMail configuration found")) {
      errorMessage = "WorkMail not configured. Set up WorkMail connection first.";
    } else if (err.name === "OrganizationNotFoundException") {
      errorMessage = "WorkMail organization not found";
    } else if (err.name === "UnauthorizedOperation" || err.name === "AccessDeniedException") {
      errorMessage = "Not authorized to access WorkMail";
    } else {
      errorMessage = err.message;
    }
    
    return NextResponse.json({
      connected,
      error: errorMessage,
      code: err.name
    });
  }
}