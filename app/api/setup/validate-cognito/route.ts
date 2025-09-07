// app/api/setup/validate-cognito/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  DynamoDBClient,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || "CloudServices";
const ORGS_TABLE = process.env.ORGANIZATIONS_TABLE_NAME || "Organizations";

export async function POST(req: Request) {
  try {
    const { userPoolId, clientId, region, accessKey, secretKey } = await req.json();
    
    if (!userPoolId || !clientId || !region || !accessKey || !secretKey) {
      return NextResponse.json(
        { valid: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    console.log(`🔍 Validating Cognito config for user pool: ${userPoolId}`);
    
    // Check for duplicate configurations first (before making AWS calls)
    console.log(`🔍 Checking for existing organizations with same Cognito configuration...`);
    try {
      // Check Organizations table for same userPoolId + region combination
      const scanOrgsCommand = new ScanCommand({
        TableName: ORGS_TABLE,
        FilterExpression: "userPoolId = :userPoolId AND #region = :region",
        ExpressionAttributeNames: {
          "#region": "region"
        },
        ExpressionAttributeValues: {
          ":userPoolId": { S: userPoolId },
          ":region": { S: region }
        }
      });
      
      const existingOrgs = await ddb.send(scanOrgsCommand);
      
      if (existingOrgs.Items && existingOrgs.Items.length > 0) {
        const existingOrgName = existingOrgs.Items[0].name?.S || "Unknown";
        const existingOrgId = existingOrgs.Items[0].organizationId?.S || "unknown";
        console.log(`❌ Found existing organization with same Cognito config: ${existingOrgName}`);
        return NextResponse.json({
          valid: false,
          message: `This Cognito user pool (${userPoolId}) is already connected to organization "${existingOrgName}". Each Cognito configuration can only be used once.`,
          error: "DuplicateCognitoConfigError",
          existingOrganization: {
            name: existingOrgName,
            id: existingOrgId,
            loginUrl: `/o/${existingOrgId}/login`
          }
        }, { status: 409 });
      }

      // Also check CloudServices table for same cognito configuration
      const scanCSCommand = new ScanCommand({
        TableName: CS_TABLE,
        FilterExpression: "serviceType = :serviceType AND userPoolId = :userPoolId AND #region = :region",
        ExpressionAttributeNames: {
          "#region": "region"
        },
        ExpressionAttributeValues: {
          ":serviceType": { S: "cognito" },
          ":userPoolId": { S: userPoolId },
          ":region": { S: region }
        }
      });
      
      const existingCS = await ddb.send(scanCSCommand);
      
      if (existingCS.Items && existingCS.Items.length > 0) {
        const existingOrgId = existingCS.Items[0].orgId?.S || "unknown";
        console.log(`❌ Found existing Cognito service for org: ${existingOrgId}`);
        return NextResponse.json({
          valid: false,
          message: `This Cognito user pool (${userPoolId}) is already connected to another organization. Each Cognito configuration can only be used once.`,
          error: "DuplicateCognitoServiceError",
          existingOrganization: {
            id: existingOrgId,
            loginUrl: `/o/${existingOrgId}/login`
          }
        }, { status: 409 });
      }

      // Also check for duplicate client ID (even with different user pools)
      const scanClientIdCommand = new ScanCommand({
        TableName: CS_TABLE,
        FilterExpression: "serviceType = :serviceType AND clientId = :clientId",
        ExpressionAttributeValues: {
          ":serviceType": { S: "cognito" },
          ":clientId": { S: clientId }
        }
      });
      
      const existingClientId = await ddb.send(scanClientIdCommand);
      
      if (existingClientId.Items && existingClientId.Items.length > 0) {
        const existingOrgId = existingClientId.Items[0].orgId?.S || "unknown";
        console.log(`❌ Found existing client ID for org: ${existingOrgId}`);
        return NextResponse.json({
          valid: false,
          message: `This Cognito client ID (${clientId}) is already in use by another organization. Each client ID can only be used once.`,
          error: "DuplicateClientIdError",
          existingOrganization: {
            id: existingOrgId,
            loginUrl: `/o/${existingOrgId}/login`
          }
        }, { status: 409 });
      }
      
      console.log(`✅ No duplicate Cognito configurations found`);
    } catch (error: any) {
      console.warn(`⚠️ Warning checking for duplicate configurations:`, error.message);
      // Continue with validation even if duplicate check fails
    }
    
    // Create Cognito client with provided credentials
    const cognitoClient = new CognitoIdentityProviderClient({
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });

    try {
      // Test 1: Describe user pool to verify it exists and we have access
      console.log("📋 Testing user pool access...");
      const describeCommand = new DescribeUserPoolCommand({
        UserPoolId: userPoolId,
      });
      const userPool = await cognitoClient.send(describeCommand);
      
      console.log(`✅ User pool found: ${userPool.UserPool?.Name}`);

      // Test 2: List users to verify we can read user data
      console.log("👥 Testing user listing...");
      const listUsersCommand = new ListUsersCommand({
        UserPoolId: userPoolId,
        Limit: 20, // Limit for validation
      });
      const usersResponse = await cognitoClient.send(listUsersCommand);
      
      const users = (usersResponse.Users || []).map(user => {
        const getAttributeValue = (attributeName: string) => {
          const attr = user.Attributes?.find(a => a.Name === attributeName);
          return attr?.Value || "";
        };

        return {
          username: user.Username || "",
          email: getAttributeValue("email"),
          enabled: user.Enabled || false,
          userCreateDate: user.UserCreateDate?.toISOString() || "",
          userStatus: user.UserStatus || "UNKNOWN",
          attributes: {
            email_verified: getAttributeValue("email_verified"),
            name: getAttributeValue("name"),
            given_name: getAttributeValue("given_name"),
            family_name: getAttributeValue("family_name"),
            preferred_username: getAttributeValue("preferred_username"),
          }
        };
      });

      console.log(`✅ Found ${users.length} users in user pool`);

      return NextResponse.json({
        valid: true,
        message: `Successfully validated Cognito configuration. Found ${users.length} users.`,
        userPool: {
          id: userPool.UserPool?.Id,
          name: userPool.UserPool?.Name,
          status: userPool.UserPool?.Status,
          creationDate: userPool.UserPool?.CreationDate?.toISOString(),
          policies: userPool.UserPool?.Policies,
        },
        users,
      });

    } catch (cognitoError: any) {
      console.error("❌ Cognito validation error:", cognitoError);
      
      let errorMessage = "Failed to validate AWS Cognito configuration";
      
      if (cognitoError.name === "ResourceNotFoundException") {
        errorMessage = "User pool not found. Please check your User Pool ID.";
      } else if (cognitoError.name === "NotAuthorizedException" || cognitoError.name === "UnauthorizedOperation") {
        errorMessage = "Access denied. Please check your AWS credentials and IAM permissions.";
      } else if (cognitoError.name === "InvalidParameterException") {
        errorMessage = "Invalid parameters. Please check your configuration values.";
      } else if (cognitoError.message) {
        errorMessage = cognitoError.message;
      }
      
      return NextResponse.json({
        valid: false,
        message: errorMessage,
        error: cognitoError.name || "CognitoError",
      }, { status: 400 });
    }

  } catch (error: any) {
    console.error("❌ Setup validation error:", error);
    
    return NextResponse.json(
      {
        valid: false,
        message: error.message || "Internal server error during validation",
        error: error.name || "ValidationError",
      },
      { status: 500 }
    );
  }
}