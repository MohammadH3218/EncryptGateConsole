// app/api/company-settings/cloud-services/[id]/route.ts

export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  UpdateItemCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";

// Only use the org ID env var
const ORG_ID = process.env.ORGANIZATION_ID!;
const TABLE = 
  process.env.CLOUDSERVICES_TABLE_NAME || 
  process.env.CLOUDSERVICES_TABLE || 
  "CloudServices";

console.log("🔧 Cloud Services [id] API starting with:", { ORG_ID, TABLE });

// Use default credential provider chain
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });

// Update an existing cloud service
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const [orgId, serviceType] = id.split('_');
    
    // Validate parameters
    if (orgId !== ORG_ID || !serviceType) {
      return NextResponse.json(
        { error: "Invalid service ID format" },
        { status: 400 }
      );
    }
    
    const body = await req.json();
    const { userPoolId, clientId, clientSecret, region } = body;
    
    if (!userPoolId || !clientId || !region) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    
    // Validate the Cognito credentials before updating
    try {
      const cognito = new CognitoIdentityProviderClient({
        region,
      });
      
      await cognito.send(
        new DescribeUserPoolCommand({
          UserPoolId: userPoolId,
        })
      );
    } catch (err: any) {
      console.error("❌ Cognito validation error:", err);
      
      let errorMessage = "Failed to validate AWS Cognito credentials";
      
      if (err.name === "UserPoolNotFoundException") {
        errorMessage = "User Pool not found. Please check the User Pool ID.";
      } else if (err.name === "InvalidParameterException") {
        errorMessage = "Invalid parameters. Please check your inputs.";
      } else if (err.name === "NotAuthorizedException") {
        errorMessage = "Not authorized. Please check your AWS credentials and permissions.";
      }
      
      return NextResponse.json(
        { error: errorMessage, message: err.message },
        { status: 400 }
      );
    }
    
    // Update the item in DynamoDB
    const now = new Date().toISOString();
    
    // Build the update expression dynamically with proper typing
    let updateExpression = "SET userPoolId = :userPoolId, clientId = :clientId, region = :region, lastSynced = :lastSynced";
    const expressionAttributeValues: Record<string, any> = {
      ":userPoolId": { S: userPoolId },
      ":clientId": { S: clientId },
      ":region": { S: region },
      ":lastSynced": { S: now },
    };
    
    // Only update client secret if provided (allows keeping existing secret)
    if (clientSecret) {
      updateExpression += ", clientSecret = :clientSecret";
      expressionAttributeValues[":clientSecret"] = { S: clientSecret };
    }
    
    await ddb.send(
      new UpdateItemCommand({
        TableName: TABLE,
        Key: {
          orgId: { S: ORG_ID },
          serviceType: { S: serviceType },
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    );
    console.log("✅ UpdateItem succeeded for", serviceType);
    
    // Return the updated service (don't include the secret in response)
    return NextResponse.json({
      id: `${ORG_ID}_${serviceType}`,
      name: serviceType === "aws-cognito" ? "AWS Cognito" : serviceType,
      status: "connected",
      lastSynced: now,
      userCount: 0,
      userPoolId,
      clientId,
      region,
      hasClientSecret: !!clientSecret // Indicate if secret was updated
    });
  } catch (err) {
    console.error("❌ PUT /cloud-services/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to update cloud service", message: String(err) },
      { status: 500 }
    );
  }
}

// Delete a cloud service
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const [orgId, serviceType] = id.split('_');
    
    // Validate parameters
    if (orgId !== ORG_ID || !serviceType) {
      return NextResponse.json(
        { error: "Invalid service ID format" },
        { status: 400 }
      );
    }
    
    // Delete the item from DynamoDB
    await ddb.send(
      new DeleteItemCommand({
        TableName: TABLE,
        Key: {
          orgId: { S: ORG_ID },
          serviceType: { S: serviceType },
        },
      })
    );
    console.log("✅ DeleteItem succeeded for", serviceType);
    
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("❌ DELETE /cloud-services/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to delete cloud service", message: String(err) },
      { status: 500 }
    );
  }
}