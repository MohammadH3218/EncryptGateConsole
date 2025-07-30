// app/api/company-settings/employees/[id]/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  DeleteItemCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";

// Environment variables
const ORG_ID = process.env.ORGANIZATION_ID!;
const EMPLOYEES_TABLE = process.env.EMPLOYEES_TABLE_NAME || "Employees";

if (!ORG_ID) throw new Error("Missing ORGANIZATION_ID env var");

console.log("🔧 Employee [id] API starting with:", { ORG_ID, EMPLOYEES_TABLE });

// DynamoDB client with default credential provider chain
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });

// DELETE - remove an employee from monitoring
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const email = decodeURIComponent(params.id);
    console.log(`🗑️ Removing employee from monitoring: ${email}`);
    
    // Get employee info first to confirm they exist
    const employeeResp = await ddb.send(new GetItemCommand({
      TableName: EMPLOYEES_TABLE,
      Key: {
        orgId: { S: ORG_ID },
        email: { S: email },
      },
    }));

    if (!employeeResp.Item) {
      console.warn(`⚠️ Employee not found in monitoring: ${email}`);
      return NextResponse.json(
        { error: "Employee not found in monitoring" },
        { status: 404 }
      );
    }

    console.log(`👤 Found monitored employee: ${email}`);

    // Remove from our Employees table
    // Note: We're NOT deleting from WorkMail, just stopping monitoring
    await ddb.send(new DeleteItemCommand({
      TableName: EMPLOYEES_TABLE,
      Key: {
        orgId: { S: ORG_ID },
        email: { S: email },
      },
    }));

    console.log(`✅ Employee removed from monitoring successfully: ${email}`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("❌ [employees:DELETE]", err);
    
    let statusCode = 500;
    let errorMessage = "Failed to remove employee from monitoring";
    
    if (err.name === "ResourceNotFoundException") {
      statusCode = 404;
      errorMessage = "Employee not found in monitoring";
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