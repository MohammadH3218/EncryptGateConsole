// app/api/company-settings/cloud-services/route.ts

// 1) Force Node.js Lambda so `process.env` is available at runtime
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  ListTablesCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";

// 2) Only two env-vars now: your org ID and table name
const ORG_ID = process.env.ORGANIZATION_ID!;
const TABLE  =
  process.env.CLOUDSERVICES_TABLE_NAME ||
  process.env.CLOUDSERVICES_TABLE         ||
  "CloudServices";

console.log("🔧 Cloud Services API starting with:", { ORG_ID, TABLE });

// 3) Instantiate DynamoDBClient with the default credential/provider chain.
//    Amplify will inject AWS_REGION and your SSR IAM role at runtime.
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });

// 4) GET handler
export async function GET(req: Request) {
  try {
    // 4a) Quick connectivity check
    const list = await ddb.send(new ListTablesCommand({}));
    console.log("✅ ListTables OK:", list.TableNames);

    // 4b) Your actual query
    const resp = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "orgId = :orgId",
      ExpressionAttributeValues: {
        ":orgId": { S: ORG_ID },
      },
    }));
    console.log(`✅ Query returned ${resp.Count} items`);

    // 4c) Map to your UI shape
    const services = (resp.Items || []).map(item => {
      const orgId       = item.orgId?.S;
      const serviceType = item.serviceType?.S;
      if (!orgId || !serviceType) return null;
      return {
        id:         `${orgId}_${serviceType}`,
        name:       serviceType === "aws-cognito" ? "AWS Cognito" : serviceType,
        status:     (item.status?.S as any)       || "disconnected",
        lastSynced: item.lastSynced?.S            || new Date().toISOString(),
        userCount:  item.userCount?.N
                     ? parseInt(item.userCount.N)
                     : 0,
      };
    }).filter(Boolean);

    return NextResponse.json(services);
  } catch (err) {
    console.error("❌ GET /cloud-services error:", err);
    return NextResponse.json(
      { error: "Failed to fetch cloud services", message: String(err) },
      { status: 500 }
    );
  }
}

// 5) POST handler
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { serviceType, userPoolId, clientId, region } = body;
    if (!serviceType || !userPoolId || !clientId || !region) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // 5a) Build DynamoDB item
    const now = new Date().toISOString();
    const item = {
      orgId:       { S: ORG_ID },
      serviceType: { S: serviceType },
      userPoolId:  { S: userPoolId },
      clientId:    { S: clientId },
      region:      { S: region },
      status:      { S: "connected" },
      lastSynced:  { S: now },
      userCount:   { N: "0" },
    };

    // 5b) Write to DynamoDB
    await ddb.send(new PutItemCommand({
      TableName: TABLE,
      Item:      item,
    }));
    console.log("✅ PutItem succeeded for", serviceType);

    // 5c) Return the new service
    return NextResponse.json({
      id:         `${ORG_ID}_${serviceType}`,
      name:       serviceType === "aws-cognito" ? "AWS Cognito" : serviceType,
      status:     "connected",
      lastSynced: now,
      userCount:  0,
    });
  } catch (err) {
    console.error("❌ POST /cloud-services error:", err);
    return NextResponse.json(
      { error: "Failed to save cloud service", message: String(err) },
      { status: 500 }
    );
  }
}
