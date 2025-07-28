// app/api/company-settings/cloud-services/route.ts

import { NextResponse } from "next/server"
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  ListTablesCommand
} from "@aws-sdk/client-dynamodb"

// Read your custom-named env vars
const REGION = process.env.REGION!
const ORG_ID = process.env.ORGANIZATION_ID!
const ACCESS_KEY_ID = process.env.ACCESS_KEY_ID!
const SECRET_ACCESS_KEY = process.env.SECRET_ACCESS_KEY!
const TABLE = process.env.CLOUDSERVICES_TABLE_NAME || "CloudServices"

// Create DynamoDB client with better error handling
let ddb: DynamoDBClient;
try {
  ddb = new DynamoDBClient({
    region: REGION,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
  });
} catch (initError) {
  console.error("Failed to initialize DynamoDB client:", initError);
  // Will be handled in the route handlers
}

export async function GET(req: Request) {
  // Check if we're in debug mode
  const isDebugMode = req.headers.get('Debug-Mode') === 'true';
  
  try {
    // Log environment info when in debug mode
    if (isDebugMode) {
      console.log("Cloud Services API - Debug Mode", {
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
    
    console.log("GET /api/company-settings/cloud-services - Querying DynamoDB");
    
    // Test AWS connectivity if in debug mode
    let tablesListResult;
    if (isDebugMode) {
      try {
        console.log("Testing AWS connectivity with ListTables...");
        tablesListResult = await ddb.send(new ListTablesCommand({}));
        console.log("ListTables successful, found tables:", tablesListResult.TableNames);
      } catch (connError) {
        console.error("ListTables test failed:", connError);
        return NextResponse.json({
          error: "AWS connectivity test failed",
          message: typeof connError === "object" && connError !== null && "message" in connError ? (connError as any).message : String(connError),
          details: String(connError),
          debug: {
            stack: typeof connError === "object" && connError !== null && "stack" in connError ? (connError as any).stack : undefined,
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
    
    // Proceed with actual query
    const resp = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "orgId = :orgId",
        ExpressionAttributeValues: {
          ":orgId": { S: ORG_ID },
        },
      })
    );

    const services = (resp.Items || []).map((it) => ({
      id: `${it.orgId.S}_${it.serviceType.S}`,
      name:
        it.serviceType.S === "aws-cognito" ? "AWS Cognito" : it.serviceType.S,
      status:
        (it.status?.S as "connected" | "disconnected") || "disconnected",
      lastSynced: it.lastSynced?.S!,
      userCount: it.userCount?.N ? parseInt(it.userCount.N) : 0,
    }));

    console.log("Returning services data, count:", services.length);
    
    // If in debug mode, include additional diagnostic info
    if (isDebugMode) {
      return NextResponse.json({
        services: services,
        debug: {
          timestamp: new Date().toISOString(),
          awsConnectivity: {
            success: true,
            availableTables: tablesListResult?.TableNames || []
          },
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
    
    // Normal mode - just return the services
    return NextResponse.json(services);
  } catch (error) {
    console.error("Error in GET /api/company-settings/cloud-services:", error);
    
    return NextResponse.json(
      { 
        error: "Failed to fetch cloud services", 
        message: typeof error === "object" && error !== null && "message" in error ? (error as any).message : String(error),
        details: String(error),
        debug: isDebugMode ? {
          stack: typeof error === "object" && error !== null && "stack" in error ? (error as any).stack : undefined,
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
    
    console.log("POST /api/company-settings/cloud-services - Start");
    
    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error("Failed to parse request body:", parseError);
      return NextResponse.json({ 
        error: "Invalid request format",
        message: "Could not parse JSON body" 
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
          message: typeof connError === "object" && connError !== null && "message" in connError ? (connError as any).message : String(connError),
          details: String(connError),
          debug: {
            stack: typeof connError === "object" && connError !== null && "stack" in connError ? (connError as any).stack : undefined,
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
        message: typeof error === "object" && error !== null && "message" in error ? (error as any).message : String(error),
        details: String(error),
        debug: isDebugMode ? {
          stack: typeof error === "object" && error !== null && "stack" in error ? (error as any).stack : undefined,
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