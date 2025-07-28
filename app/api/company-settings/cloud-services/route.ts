// app/api/company-settings/cloud-services/route.ts

import { NextResponse } from "next/server"
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  ListTablesCommand,
  GetItemCommand
} from "@aws-sdk/client-dynamodb"

// HARDCODED VALUES FOR TESTING
// ⚠️ IMPORTANT: REMOVE THESE AFTER TESTING AND GO BACK TO ENVIRONMENT VARIABLES
const REGION = "us-east-1"
const ORG_ID = "company1"
const ACCESS_KEY_ID = "AKIA6JKEYBBJHJRCS6WZ"
const SECRET_ACCESS_KEY = "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"
const TABLE = "CloudServices"

console.log("Using hardcoded configuration values for testing");
console.log(`Region: ${REGION}, Table: ${TABLE}, OrgID: ${ORG_ID}`);
console.log(`Access Key ID: ${ACCESS_KEY_ID.substring(0, 5)}...`);

// Create DynamoDB client with explicit endpoint
let ddb: DynamoDBClient;
try {
  ddb = new DynamoDBClient({
    region: REGION,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
    endpoint: `https://dynamodb.${REGION}.amazonaws.com`, // Explicit endpoint
  });
  
  console.log("DynamoDB client initialized successfully");
} catch (initError) {
  console.error("Failed to initialize DynamoDB client:", initError);
}

export async function GET(req: Request) {
  const isDebugMode = req.headers.get('Debug-Mode') === 'true';
  
  try {
    if (!ddb) {
      throw new Error("DynamoDB client is not initialized");
    }
    
    console.log("Testing AWS connectivity...");
    
    // Step 1: Simple ListTables call to test basic connectivity
    try {
      console.log("Testing ListTables...");
      const tablesResult = await ddb.send(new ListTablesCommand({}));
      console.log("ListTables successful, found tables:", tablesResult.TableNames);
      
      // If our target table is in the list, that's a good sign
      if (tablesResult.TableNames?.includes(TABLE)) {
        console.log(`Table '${TABLE}' found in the list!`);
      } else {
        console.log(`Table '${TABLE}' NOT found in list:`, tablesResult.TableNames);
      }
    } catch (listError) {
      console.error("ListTables failed:", listError);
      throw new Error(`ListTables failed: ${(listError as any).message || String(listError)}`);
    }
    
    // Step 2: Try a GetItem first (simpler than Query)
    try {
      console.log("Testing GetItem with a test key...");
      const getItemResult = await ddb.send(new GetItemCommand({
        TableName: TABLE,
        Key: {
          "orgId": { S: ORG_ID },
          "serviceType": { S: "aws-cognito" } // Assuming this is a common service type
        }
      }));
      console.log("GetItem result:", getItemResult.Item ? "Item found" : "No item found");
    } catch (getError) {
      console.error("GetItem test failed:", getError);
      // Continue to Query - don't throw here as GetItem might fail simply because the item doesn't exist
    }
    
    // Step 3: Now try the actual Query
    console.log("Querying DynamoDB table:", TABLE, "with orgId:", ORG_ID);
    
    const resp = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "orgId = :orgId",
        ExpressionAttributeValues: {
          ":orgId": { S: ORG_ID },
        },
      })
    );
    
    console.log("Query response:", resp);
    
    // Safely handle the response
    if (!resp || !resp.Items || resp.Items.length === 0) {
      console.log("Query returned no items");
      return NextResponse.json(isDebugMode 
        ? {
            services: [],
            debug: {
              message: "Query successful but returned no items",
              tables: await ddb.send(new ListTablesCommand({})).then(r => r.TableNames)
            }
          }
        : []);
    }
    
    // Map items to response format
    const services = resp.Items.map((item) => {
      try {
        if (!item.orgId?.S || !item.serviceType?.S) {
          console.warn("Item missing required fields:", item);
          return null;
        }
        
        return {
          id: `${item.orgId.S}_${item.serviceType.S}`,
          name: item.serviceType.S === "aws-cognito" ? "AWS Cognito" : item.serviceType.S,
          status: (item.status?.S as "connected" | "disconnected") || "disconnected",
          lastSynced: item.lastSynced?.S || new Date().toISOString(),
          userCount: item.userCount?.N ? parseInt(item.userCount.N) : 0,
        };
      } catch (mapError) {
        console.error("Error mapping item:", mapError, item);
        return null;
      }
    }).filter(Boolean);

    console.log("Mapped services:", services);
    
    return NextResponse.json(isDebugMode 
      ? {
          services: services,
          debug: {
            rawItems: resp.Items.length,
            tables: await ddb.send(new ListTablesCommand({})).then(r => r.TableNames)
          }
        }
      : services);
  } catch (error) {
    console.error("Error in GET /api/company-settings/cloud-services:", error);
    
    return NextResponse.json(
      { 
        error: "Failed to fetch cloud services", 
        message: typeof error === "object" && error && "message" in error ? (error as any).message : String(error),
        details: String(error),
        // Include stack trace and additional debug info
        debug: {
          stack: typeof error === "object" && error && "stack" in error ? (error as any).stack : undefined,
          errorType: typeof error === "object" && error && "name" in error ? (error as any).name : undefined
        }
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const isDebugMode = req.headers.get('Debug-Mode') === 'true';
  
  try {
    if (!ddb) {
      throw new Error("DynamoDB client is not initialized");
    }
    
    console.log("POST /api/company-settings/cloud-services - Start");
    
    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error("Failed to parse request body:", parseError);
      return NextResponse.json({ 
        error: "Invalid request format",
        message: typeof parseError === "object" && parseError && "message" in parseError 
          ? (parseError as any).message 
          : "Could not parse JSON body"
      }, { status: 400 });
    }
    
    const { serviceType, userPoolId, clientId, region } = body;
    const now = new Date().toISOString();

    // Validate required fields
    if (!serviceType || !userPoolId || !clientId || !region) {
      console.error("Missing required fields in request body");
      
      return NextResponse.json(
        { 
          error: "Missing required fields in request",
          requiredFields: ["serviceType", "userPoolId", "clientId", "region"],
          receivedFields: Object.keys(body)
        },
        { status: 400 }
      );
    }
    
    // Test basic connectivity first
    try {
      console.log("Testing ListTables before performing write...");
      const tablesResult = await ddb.send(new ListTablesCommand({}));
      console.log("ListTables successful, found tables:", tablesResult.TableNames);
    } catch (listError) {
      console.error("ListTables failed:", listError);
      throw new Error(`Cannot connect to DynamoDB: ${(listError as any).message || String(listError)}`);
    }

    const item = {
      orgId:        { S: ORG_ID },
      serviceType:  { S: serviceType },
      userPoolId:   { S: userPoolId },
      clientId:     { S: clientId },
      region:       { S: region },
      status:       { S: "connected" },
      lastSynced:   { S: now },
      userCount:    { N: "0" },
    };

    console.log("Saving cloud service config to DynamoDB:", {
      table: TABLE,
      serviceType: serviceType
    });
    
    try {
      await ddb.send(
        new PutItemCommand({
          TableName: TABLE,
          Item: item,
        })
      );
      console.log("PutItem successful");
    } catch (putError) {
      console.error("PutItem failed:", putError);
      throw new Error(`Failed to write to DynamoDB: ${(putError as any).message || String(putError)}`);
    }

    console.log("Cloud service configuration saved successfully");
    
    // Return response
    return NextResponse.json({
      id:         `${ORG_ID}_${serviceType}`,
      name:       serviceType === "aws-cognito" ? "AWS Cognito" : serviceType,
      status:     "connected",
      lastSynced: now,
      userCount:  0,
    });
  } catch (error) {
    console.error("Error in POST /api/company-settings/cloud-services:", error);
    
    return NextResponse.json(
      { 
        error: "Failed to save cloud service configuration", 
        message: typeof error === "object" && error && "message" in error 
          ? (error as any).message 
          : String(error),
        details: String(error),
        debug: isDebugMode ? {
          stack: typeof error === "object" && error && "stack" in error 
            ? (error as any).stack 
            : undefined,
          errorType: typeof error === "object" && error && "name" in error 
            ? (error as any).name 
            : undefined
        } : undefined
      },
      { status: 500 }
    );
  }
}