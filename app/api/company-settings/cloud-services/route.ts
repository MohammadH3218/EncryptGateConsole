// app/api/company-settings/cloud-services/route.ts

import { NextResponse } from "next/server"
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  ListTablesCommand
} from "@aws-sdk/client-dynamodb"

// Immediately log environment variables for debugging
console.log("Cloud Services API - Environment Check:", {
  REGION_EXISTS: !!process.env.REGION,
  ORG_ID_EXISTS: !!process.env.ORGANIZATION_ID,
  ACCESS_KEY_EXISTS: !!process.env.ACCESS_KEY_ID,
  SECRET_KEY_EXISTS: !!process.env.SECRET_ACCESS_KEY,
  TABLE_NAME: process.env.CLOUDSERVICES_TABLE_NAME || "CloudServices",
});

// Read your custom-named env vars
const REGION = process.env.REGION!
const ORG_ID = process.env.ORGANIZATION_ID!
const ACCESS_KEY_ID = process.env.ACCESS_KEY_ID!
const SECRET_ACCESS_KEY = process.env.SECRET_ACCESS_KEY!
const TABLE = process.env.CLOUDSERVICES_TABLE_NAME || "CloudServices"

// Create DynamoDB client with proper error handling
let ddb: DynamoDBClient;
try {
  if (!REGION || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
    throw new Error(`Missing required AWS configuration. REGION: ${!!REGION}, ACCESS_KEY: ${!!ACCESS_KEY_ID}, SECRET_KEY: ${!!SECRET_ACCESS_KEY}`);
  }
  
  // Explicitly configure with your custom-named environment variables
  ddb = new DynamoDBClient({
    region: REGION,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
  });
  
  console.log("DynamoDB client initialized successfully");
} catch (initError) {
  console.error("Failed to initialize DynamoDB client:", initError);
  // We'll handle this in the route handlers
}

export async function GET(req: Request) {
  // Check if we're in debug mode
  const isDebugMode = req.headers.get('Debug-Mode') === 'true';
  
  try {
    // Verify DynamoDB client is initialized
    if (!ddb) {
      throw new Error("DynamoDB client is not initialized. Check environment variables.");
    }
    
    console.log("GET /api/company-settings/cloud-services - Querying DynamoDB");
    
    // Test AWS connectivity if in debug mode
    if (isDebugMode) {
      try {
        console.log("Testing AWS connectivity with ListTables...");
        const tablesListResult = await ddb.send(new ListTablesCommand({}));
        console.log("ListTables successful, found tables:", tablesListResult.TableNames);
      } catch (connError) {
        console.error("ListTables test failed:", connError);
        return NextResponse.json({
          error: "AWS connectivity test failed",
          message: typeof connError === "object" && connError && "message" in connError ? (connError as any).message : String(connError),
          details: String(connError),
          environment: {
            REGION_EXISTS: !!REGION,
            ORG_ID_EXISTS: !!ORG_ID,
            ACCESS_KEY_EXISTS: !!ACCESS_KEY_ID,
            SECRET_KEY_EXISTS: !!SECRET_ACCESS_KEY,
            TABLE_NAME: TABLE,
          }
        }, { status: 500 });
      }
    }
    
    // Safely run the DynamoDB query with error handling
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
    
    // Safely handle the response
    if (!resp || !resp.Items) {
      console.log("DynamoDB query returned no items or empty response");
      return NextResponse.json(
        isDebugMode
          ? {
              services: [],
              debug: {
                message: "DynamoDB query returned no items",
                rawResponse: resp || "null/undefined response",
                environment: {
                  REGION_EXISTS: !!REGION,
                  ORG_ID_EXISTS: !!ORG_ID,
                  ACCESS_KEY_EXISTS: !!ACCESS_KEY_ID,
                  SECRET_KEY_EXISTS: !!SECRET_ACCESS_KEY,
                }
              }
            }
          : []
      );
    }
    
    // Safely map items with better error handling
    const services = resp.Items.map((item) => {
      try {
        // Check for required fields before accessing
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
        console.error("Error mapping DynamoDB item:", mapError, item);
        return null;
      }
    }).filter(Boolean); // Remove any null entries

    console.log("Returning services data, count:", services.length);
    
    // Return appropriate response based on debug mode
    if (isDebugMode) {
      return NextResponse.json({
        services: services,
        debug: {
          timestamp: new Date().toISOString(),
          environment: {
            REGION_EXISTS: !!REGION,
            ORG_ID_EXISTS: !!ORG_ID,
            ACCESS_KEY_EXISTS: !!ACCESS_KEY_ID,
            SECRET_KEY_EXISTS: !!SECRET_ACCESS_KEY,
            TABLE_NAME: TABLE,
          },
          query: {
            tableName: TABLE,
            keyCondition: "orgId = :orgId",
            orgId: ORG_ID,
            resultCount: resp.Count,
            scannedCount: resp.ScannedCount
          }
        }
      });
    }
    
    return NextResponse.json(services);
  } catch (error) {
    console.error("Error in GET /api/company-settings/cloud-services:", error);
    
    return NextResponse.json(
      { 
        error: "Failed to fetch cloud services", 
        message: typeof error === "object" && error && "message" in error ? (error as any).message : String(error),
        details: String(error),
        debug: isDebugMode ? {
          stack: typeof error === "object" && error && "stack" in error ? (error as any).stack : undefined,
          environment: {
            REGION_EXISTS: !!REGION,
            ORG_ID_EXISTS: !!ORG_ID,
            ACCESS_KEY_EXISTS: !!ACCESS_KEY_ID,
            SECRET_KEY_EXISTS: !!SECRET_ACCESS_KEY,
            TABLE_NAME: TABLE,
          }
        } : undefined
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  // Check if we're in debug mode
  const isDebugMode = req.headers.get('Debug-Mode') === 'true';
  
  try {
    // Log environment info when in debug mode
    if (isDebugMode) {
      console.log("POST to Cloud Services API - Debug Mode", {
        timestamp: new Date().toISOString(),
        env: {
          REGION: REGION || 'not set',
          ORGANIZATION_ID: ORG_ID || 'not set',
          ACCESS_KEY_ID: ACCESS_KEY_ID ? `${ACCESS_KEY_ID.substring(0, 4)}...` : 'not set',
          SECRET_ACCESS_KEY: SECRET_ACCESS_KEY ? 'set (not showing)' : 'not set',
          TABLE: TABLE,
        }
      });
    }
    
    // Verify DynamoDB client is initialized
    if (!ddb) {
      throw new Error("DynamoDB client is not initialized. Check environment variables.");
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

    // Test AWS connectivity if in debug mode
    if (isDebugMode) {
      try {
        console.log("Testing AWS connectivity with ListTables...");
        const testResult = await ddb.send(new ListTablesCommand({}));
        console.log("ListTables successful, found tables:", testResult.TableNames);
      } catch (connError) {
        console.error("ListTables test failed:", connError);
        return NextResponse.json({
          error: "AWS connectivity test failed",
          message: typeof connError === "object" && connError && "message" in connError 
            ? (connError as any).message 
            : String(connError),
          details: String(connError),
          debug: {
            stack: typeof connError === "object" && connError && "stack" in connError 
              ? (connError as any).stack 
              : undefined,
            environment: {
              REGION_EXISTS: !!REGION,
              ORG_ID_EXISTS: !!ORG_ID,
              ACCESS_KEY_EXISTS: !!ACCESS_KEY_ID,
              SECRET_KEY_EXISTS: !!SECRET_ACCESS_KEY,
              TABLE_NAME: TABLE,
            }
          }
        }, { status: 500 });
      }
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
    
    await ddb.send(
      new PutItemCommand({
        TableName: TABLE,
        Item: item,
      })
    );

    console.log("Cloud service configuration saved successfully");
    
    // If in debug mode, include additional info in response
    if (isDebugMode) {
      return NextResponse.json({
        success: true,
        service: {
          id:         `${ORG_ID}_${serviceType}`,
          name:       serviceType === "aws-cognito" ? "AWS Cognito" : serviceType,
          status:     "connected",
          lastSynced: now,
          userCount:  0,
        },
        debug: {
          timestamp: new Date().toISOString(),
          operation: "PutItem",
          table: TABLE,
          keyFields: {
            orgId: ORG_ID,
            serviceType: serviceType
          }
        }
      });
    }
    
    // Normal response
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
          environment: {
            REGION_EXISTS: !!REGION,
            ORG_ID_EXISTS: !!ORG_ID,
            ACCESS_KEY_EXISTS: !!ACCESS_KEY_ID,
            SECRET_KEY_EXISTS: !!SECRET_ACCESS_KEY,
            TABLE_NAME: TABLE,
          }
        } : undefined
      },
      { status: 500 }
    );
  }
}