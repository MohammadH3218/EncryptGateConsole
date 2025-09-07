// app/api/setup/create-organization/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { v4 as uuidv4 } from 'uuid';
import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminAddUserToGroupCommand,
  CreateGroupCommand,
  AdminCreateUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

// Use environment DynamoDB client
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || "CloudServices";
const USERS_TABLE = process.env.USERS_TABLE_NAME || "SecurityTeamUsers";
const ORGS_TABLE = process.env.ORGANIZATIONS_TABLE_NAME || "Organizations";

export async function POST(req: Request) {
  try {
    const { organization, cognito, adminUser } = await req.json();
    
    if (!organization?.name || !cognito?.userPoolId || !adminUser) {
      return NextResponse.json(
        { success: false, message: "Missing required organization data" },
        { status: 400 }
      );
    }

    console.log(`🏢 Creating organization: ${organization.name}`);
    console.log(`👤 Setting up admin user: ${adminUser}`);

    // Check for duplicate organizations with same Cognito configuration
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
          ":userPoolId": { S: cognito.userPoolId },
          ":region": { S: cognito.region }
        }
      });
      
      const existingOrgs = await ddb.send(scanOrgsCommand);
      
      if (existingOrgs.Items && existingOrgs.Items.length > 0) {
        const existingOrgName = existingOrgs.Items[0].name?.S || "Unknown";
        console.log(`❌ Found existing organization with same Cognito config: ${existingOrgName}`);
        return NextResponse.json({
          success: false,
          message: `An organization "${existingOrgName}" is already using this Cognito user pool (${cognito.userPoolId}) in region ${cognito.region}. Each Cognito configuration can only be connected to one organization.`,
          error: "DuplicateCognitoConfigError"
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
          ":userPoolId": { S: cognito.userPoolId },
          ":region": { S: cognito.region }
        }
      });
      
      const existingCS = await ddb.send(scanCSCommand);
      
      if (existingCS.Items && existingCS.Items.length > 0) {
        const existingServiceName = existingCS.Items[0].name?.S || "Unknown Cognito Service";
        console.log(`❌ Found existing Cognito service: ${existingServiceName}`);
        return NextResponse.json({
          success: false,
          message: `This Cognito user pool (${cognito.userPoolId}) is already connected to another organization. Each Cognito configuration can only be used once.`,
          error: "DuplicateCognitoServiceError"
        }, { status: 409 });
      }
      
      console.log(`✅ No duplicate Cognito configurations found`);
    } catch (error: any) {
      console.warn(`⚠️ Warning checking for duplicate configurations:`, error.message);
      // Don't fail the process for this check, just warn
    }
    
    // Generate unique organization ID
    const organizationId = `org_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
    
    // Create Cognito client with provided credentials
    const cognitoClient = new CognitoIdentityProviderClient({
      region: cognito.region,
      credentials: {
        accessKeyId: cognito.accessKey,
        secretAccessKey: cognito.secretKey,
      },
    });

    // Step 1: Get admin user details from Cognito
    console.log(`👥 Getting admin user details from Cognito...`);
    let adminUserDetails;
    try {
      const getUserCommand = new AdminGetUserCommand({
        UserPoolId: cognito.userPoolId,
        Username: adminUser,
      });
      adminUserDetails = await cognitoClient.send(getUserCommand);
      console.log(`✅ Found admin user: ${adminUserDetails.Username}`);
    } catch (error: any) {
      console.error(`❌ Failed to get admin user details:`, error);
      return NextResponse.json({
        success: false,
        message: `Failed to get admin user details: ${error.message}`,
      }, { status: 400 });
    }

    // Extract user attributes
    const getAttributeValue = (attributeName: string) => {
      const attr = adminUserDetails.UserAttributes?.find(a => a.Name === attributeName);
      return attr?.Value || "";
    };

    const adminEmail = getAttributeValue("email") || adminUser;
    const adminName = getAttributeValue("name") || 
                     getAttributeValue("preferred_username") || 
                     getAttributeValue("given_name") + " " + getAttributeValue("family_name") ||
                     organization.adminName ||
                     adminEmail.split("@")[0];

    // Step 2: Create role groups in Cognito
    console.log(`👥 Creating role groups in Cognito...`);
    const roleGroups = [
      { name: "Owner", description: "Organization owners with full access" },
      { name: "Admin", description: "Administrators with management access" },
      { name: "Security Lead", description: "Senior security analysts" },
      { name: "Senior Analyst", description: "Experienced security analysts" },
      { name: "Security Analyst", description: "Security analysts" },
      { name: "Junior Analyst", description: "Entry-level analysts" },
      { name: "Viewer", description: "Read-only access" },
    ];

    for (const roleGroup of roleGroups) {
      try {
        const createGroupCommand = new CreateGroupCommand({
          GroupName: roleGroup.name,
          UserPoolId: cognito.userPoolId,
          Description: roleGroup.description,
        });
        await cognitoClient.send(createGroupCommand);
        console.log(`✅ Created role group: ${roleGroup.name}`);
      } catch (error: any) {
        // Group might already exist, which is fine
        if (error.name !== "GroupExistsException") {
          console.warn(`⚠️ Warning creating group ${roleGroup.name}:`, error.message);
        }
      }
    }

    // Step 3: Add admin user to Owner group
    console.log(`👑 Adding admin user to Owner group...`);
    try {
      const addToGroupCommand = new AdminAddUserToGroupCommand({
        UserPoolId: cognito.userPoolId,
        Username: adminUser,
        GroupName: "Owner",
      });
      await cognitoClient.send(addToGroupCommand);
      console.log(`✅ Added ${adminUser} to Owner group`);
    } catch (error: any) {
      console.warn(`⚠️ Warning adding user to Owner group:`, error.message);
    }

    // Step 4: Store organization in database
    console.log(`💾 Storing organization in database...`);
    const orgCreationTime = new Date().toISOString();
    
    try {
      // Store in Organizations table
      await ddb.send(new PutItemCommand({
        TableName: ORGS_TABLE,
        Item: {
          organizationId: { S: organizationId },
          name: { S: organization.name },
          status: { S: "active" },
          createdAt: { S: orgCreationTime },
          createdBy: { S: adminEmail },
          adminEmail: { S: adminEmail },
          adminName: { S: adminName },
          userPoolId: { S: cognito.userPoolId },
          region: { S: cognito.region },
        },
      }));
      console.log(`✅ Organization stored in database`);
    } catch (error: any) {
      console.error(`❌ Failed to store organization:`, error);
      return NextResponse.json({
        success: false,
        message: `Failed to store organization: ${error.message}`,
      }, { status: 500 });
    }

    // Step 5: Store Cognito configuration as a cloud service
    console.log(`☁️ Storing Cognito configuration...`);
    try {
      await ddb.send(new PutItemCommand({
        TableName: CS_TABLE,
        Item: {
          orgId: { S: organizationId },
          serviceType: { S: "cognito" },
          name: { S: `Cognito User Pool - ${organization.name}` },
          domain: { S: `${cognito.userPoolId}.auth.${cognito.region}.amazoncognito.com` },
          userPoolId: { S: cognito.userPoolId },
          clientId: { S: cognito.clientId },
          region: { S: cognito.region },
          status: { S: "connected" },
          lastSynced: { S: orgCreationTime },
          userCount: { N: "1" },
          createdAt: { S: orgCreationTime },
          ...(cognito.clientSecret && { hasClientSecret: { BOOL: true } }),
        },
      }));
      console.log(`✅ Cognito configuration stored`);
    } catch (error: any) {
      console.error(`❌ Failed to store Cognito config:`, error);
      // Don't fail the entire process for this
    }

    // Step 6: Add admin user to security team
    console.log(`🛡️ Adding admin user to security team...`);
    try {
      await ddb.send(new PutItemCommand({
        TableName: USERS_TABLE,
        Item: {
          orgId: { S: organizationId },
          email: { S: adminEmail },
          name: { S: adminName },
          role: { S: "Owner" },
          status: { S: "active" },
          addedAt: { S: orgCreationTime },
          lastLogin: { S: orgCreationTime },
          isFounder: { BOOL: true },
        },
      }));
      console.log(`✅ Admin user added to security team`);
    } catch (error: any) {
      console.error(`❌ Failed to add admin user to security team:`, error);
      // Don't fail the entire process for this
    }

    console.log(`🎉 Organization ${organization.name} created successfully!`);
    
    return NextResponse.json({
      success: true,
      organizationId,
      message: `Organization "${organization.name}" created successfully`,
      adminUser: {
        email: adminEmail,
        name: adminName,
        role: "Owner",
      },
    });

  } catch (error: any) {
    console.error("❌ Organization creation error:", error);
    
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to create organization",
        error: error.name || "OrganizationCreationError",
      },
      { status: 500 }
    );
  }
}