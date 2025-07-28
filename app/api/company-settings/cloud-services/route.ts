// app/api/company-settings/cloud-services/route.ts

// 1) Force Node.js Lambda (not Edge) so process.env is available at runtime
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  ListTablesCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";

// 2) Load from env, falling back to sane defaults if a var is missing
const REGION            = process.env.REGION                   || "us-east-1";
const ORG_ID            = process.env.ORGANIZATION_ID          || "";
const ACCESS_KEY_ID     = process.env.ACCESS_KEY_ID            || "";
const SECRET_ACCESS_KEY = process.env.SECRET_ACCESS_KEY        || "";
const TABLE = process.env.CLOUDSERVICES_TABLE || "CloudServices";

// 3) Quick sanity-check at startup
console.log("Cloud Services API – ENV VARS:", {
  REGION,
  ORG_ID,
  ACCESS_KEY_ID: ACCESS_KEY_ID   ? ACCESS_KEY_ID.substring(0,5) + "…" : undefined,
  SECRET_ACCESS_KEY: SECRET_ACCESS_KEY ? "*****" : undefined,
  TABLE,
});

// 4) Initialize DynamoDB client
let ddb: DynamoDBClient;
try {
  if (!REGION || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
    throw new Error("Missing required AWS config (REGION, ACCESS_KEY_ID or SECRET_ACCESS_KEY)");
  }
  ddb = new DynamoDBClient({
    region: REGION,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
    endpoint: `https://dynamodb.${REGION}.amazonaws.com`,
  });
  console.log("✅ DynamoDB client initialized");
} catch (err) {
  console.error("❌ DynamoDB init error:", err);
}

export async function GET(req: Request) {
  const isDebug = req.headers.get("Debug-Mode") === "true";

  try {
    if (!ddb) throw new Error("DynamoDB client not initialized");

    // 1) Connectivity test
    console.log("→ ListTables…");
    const tables = await ddb.send(new ListTablesCommand({}));
    console.log("→ Tables:", tables.TableNames);

    // 2) Optional GetItem sanity check
    console.log("→ GetItem test…");
    await ddb.send(new GetItemCommand({
      TableName: TABLE,
      Key: {
        orgId:       { S: ORG_ID },
        serviceType: { S: "aws-cognito" },
      },
    })).then(r => console.log("→ GetItem:", r.Item ? "found" : "none"));

    // 3) Actual Query
    console.log(`→ Querying ${TABLE} for orgId=${ORG_ID}`);
    const resp = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "orgId = :orgId",
      ExpressionAttributeValues: { ":orgId": { S: ORG_ID } },
    }));
    console.log("→ Query returned:", resp.Count, "items");

    // 4) Map items to your shape
    const services = (resp.Items || []).map(item => {
      if (!item.orgId?.S || !item.serviceType?.S) return null;
      return {
        id:         `${item.orgId.S}_${item.serviceType.S}`,
        name:       item.serviceType.S === "aws-cognito" ? "AWS Cognito" : item.serviceType.S,
        status:     (item.status?.S as any) || "disconnected",
        lastSynced: item.lastSynced?.S || new Date().toISOString(),
        userCount:  item.userCount?.N ? parseInt(item.userCount.N) : 0,
      };
    }).filter(Boolean);

    return NextResponse.json(
      isDebug
        ? { services, debug: { rawCount: resp.Count, tables: tables.TableNames } }
        : services
    );
  } catch (error) {
    console.error("❌ GET error:", error);
    return NextResponse.json({
      error:   "Failed to fetch cloud services",
      message: (error as any).message,
      ...(isDebug ? { stack: (error as any).stack } : {})
    }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const isDebug = req.headers.get("Debug-Mode") === "true";

  try {
    if (!ddb) throw new Error("DynamoDB client not initialized");

    const body = await req.json().catch(() => { throw new Error("Invalid JSON body"); });
    const { serviceType, userPoolId, clientId, region } = body;
    if (!serviceType || !userPoolId || !clientId || !region) {
      throw new Error("Missing required fields: serviceType, userPoolId, clientId, region");
    }

    // connectivity test
    await ddb.send(new ListTablesCommand({}));

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

    console.log("→ Putting item into", TABLE);
    await ddb.send(new PutItemCommand({ TableName: TABLE, Item: item }));
    console.log("→ PutItem succeeded for", serviceType);

    return NextResponse.json({
      id:         `${ORG_ID}_${serviceType}`,
      name:       serviceType === "aws-cognito" ? "AWS Cognito" : serviceType,
      status:     "connected",
      lastSynced: now,
      userCount:  0,
    });
  } catch (error) {
    console.error("❌ POST error:", error);
    return NextResponse.json({
      error:   "Failed to save cloud service",
      message: (error as any).message,
      ...(isDebug ? { stack: (error as any).stack } : {})
    }, { status: 500 });
  }
}
