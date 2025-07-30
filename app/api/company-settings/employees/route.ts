// app/api/company-settings/employees/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

// Environment variables
const ORG_ID = process.env.ORGANIZATION_ID!;
const EMPLOYEES_TABLE = process.env.EMPLOYEES_TABLE_NAME || "Employees";

if (!ORG_ID) throw new Error("Missing ORGANIZATION_ID env var");

console.log("🔧 Employees API starting with:", { ORG_ID, EMPLOYEES_TABLE });

// DynamoDB client with default credential provider chain
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });

// GET - list monitored employees (from DynamoDB, synced from WorkMail)
export async function GET(req: Request) {
  console.log("🔍 GET /api/company-settings/employees - Getting monitored employees");
  
  try {
    // Query our Employees table
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
        id: item.email?.S!, // Use email as ID for consistency
        name: item.name?.S || "",
        email: item.email?.S || "",
        department: item.department?.S || "",
        jobTitle: item.jobTitle?.S || "",
        status: item.status?.S || "active",
        addedAt: item.addedAt?.S || null,
        lastEmailProcessed: item.lastEmailProcessed?.S || null,
        syncedFromWorkMail: item.syncedFromWorkMail?.S || null,
        workMailUserId: item.workMailUserId?.S || null,
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

// POST - manually add an employee to monitoring (for non-WorkMail users)
export async function POST(req: Request) {
  let name: string | undefined;
  let email: string | undefined;
  let department: string | undefined;
  let jobTitle: string | undefined;
  
  try {
    ({ name, email, department, jobTitle } = await req.json());
    if (!name || !email) {
      return NextResponse.json(
        { error: "Missing required fields", required: ["name", "email"] },
        { status: 400 }
      );
    }

    console.log(`👤 Manually adding employee to monitoring: ${email}`);

    // Add employee to our Employees table
    await ddb.send(new PutItemCommand({
      TableName: EMPLOYEES_TABLE,
      Item: {
        orgId: { S: ORG_ID },
        email: { S: email },
        name: { S: name },
        department: { S: department || "" },
        jobTitle: { S: jobTitle || "" },
        status: { S: "active" },
        addedAt: { S: new Date().toISOString() },
        lastEmailProcessed: { S: new Date().toISOString() },
        // Don't set syncedFromWorkMail for manually added employees
      },
    }));

    console.log(`✅ Employee manually added to monitoring successfully: ${email}`);
    return NextResponse.json({
      id: email,
      name,
      email,
      department: department || "",
      jobTitle: jobTitle || "",
      status: "active",
      addedAt: new Date().toISOString(),
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