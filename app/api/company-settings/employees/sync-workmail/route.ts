// app/api/company-settings/employees/sync-workmail/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { DynamoDBClient, BatchWriteItemCommand } from "@aws-sdk/client-dynamodb";
import { 
  WorkMailClient, 
  ListUsersCommand, 
  DescribeUserCommand,
  ListOrganizationsCommand 
} from "@aws-sdk/client-workmail";

// Environment variables
const ORG_ID = process.env.ORGANIZATION_ID!;
const EMPLOYEES_TABLE = process.env.EMPLOYEES_TABLE_NAME || "Employees";
const WORKMAIL_ORG_ID = process.env.WORKMAIL_ORGANIZATION_ID;

if (!ORG_ID) throw new Error("Missing ORGANIZATION_ID env var");

console.log("🔧 WorkMail Sync API starting with:", { ORG_ID, EMPLOYEES_TABLE, WORKMAIL_ORG_ID });

// DynamoDB and WorkMail clients with default credential provider chain
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });
const workmail = new WorkMailClient({ region: process.env.AWS_REGION });

export async function POST(req: Request) {
  try {
    console.log("🔄 Syncing employees from AWS WorkMail...");

    if (!WORKMAIL_ORG_ID) {
      return NextResponse.json(
        { error: "WorkMail Organization ID not configured", message: "Set WORKMAIL_ORGANIZATION_ID environment variable" },
        { status: 400 }
      );
    }

    // List all users in WorkMail organization
    const listUsersResponse = await workmail.send(new ListUsersCommand({
      OrganizationId: WORKMAIL_ORG_ID,
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
          OrganizationId: WORKMAIL_ORG_ID,
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
                orgId: { S: ORG_ID },
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
        workmailOrgId: WORKMAIL_ORG_ID
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
    
    if (err.name === "ResourceNotFoundException") {
      errorMessage = "WorkMail organization not found. Check your Organization ID.";
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
    if (!WORKMAIL_ORG_ID) {
      return NextResponse.json({
        connected: false,
        error: "WorkMail Organization ID not configured",
        message: "Set WORKMAIL_ORGANIZATION_ID environment variable"
      });
    }

    // Test connection by listing organizations
    const orgsResponse = await workmail.send(new ListOrganizationsCommand({}));
    
    const myOrg = orgsResponse.OrganizationSummaries?.find(
      org => org.OrganizationId === WORKMAIL_ORG_ID
    );

    if (!myOrg) {
      return NextResponse.json({
        connected: false,
        error: "WorkMail organization not found",
        organizationId: WORKMAIL_ORG_ID
      });
    }

    return NextResponse.json({
      connected: true,
      organizationId: WORKMAIL_ORG_ID,
      organizationAlias: myOrg.Alias,
      organizationState: myOrg.State
    });

  } catch (err: any) {
    console.error("❌ WorkMail connection test error:", err);
    return NextResponse.json({
      connected: false,
      error: err.message,
      code: err.name
    });
  }
}