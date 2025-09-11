export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";

// Environment variables
const SECURITY_SETTINGS_TABLE = process.env.SECURITY_SETTINGS_TABLE_NAME || "SecuritySettings";

console.log("🔧 Security Settings API starting with table:", SECURITY_SETTINGS_TABLE);

// DynamoDB client with default credential provider chain
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });

export interface SecuritySettings {
  userId: string;
  orgId: string;
  mfaEnabled: boolean;
  mfaMethod?: 'totp' | 'sms' | 'email';
  mfaSecret?: string; // For TOTP, encrypted
  sessionTimeout: number; // in minutes
  loginNotifications: boolean;
  failedLoginAlerts: boolean;
  deviceManagement: boolean;
  passwordLastChanged?: string;
  loginAttempts?: number;
  lockoutUntil?: string;
  createdAt: string;
  updatedAt: string;
}

// Helper function to get user ID from JWT token
function getUserIdFromToken(authHeader: string): string {
  try {
    if (!authHeader.startsWith('Bearer ')) return '';
    const token = authHeader.substring(7);
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.sub || payload['cognito:username'] || payload.username || '';
  } catch {
    return '';
  }
}

// GET - Fetch security settings for a user
export async function GET(req: Request) {
  try {
    console.log("🔍 GET /api/security/settings - Fetching user security settings");
    
    // Extract orgId and userId
    const orgId = req.headers.get('x-org-id');
    const authHeader = req.headers.get('authorization');
    
    if (!orgId || !authHeader) {
      return NextResponse.json(
        { error: "Organization ID and authorization are required" },
        { status: 400 }
      );
    }

    const userId = getUserIdFromToken(authHeader);
    if (!userId) {
      return NextResponse.json(
        { error: "Invalid authentication token" },
        { status: 401 }
      );
    }

    // Query security settings for the user
    const params = {
      TableName: SECURITY_SETTINGS_TABLE,
      Key: {
        userId: { S: userId },
        orgId: { S: orgId },
      },
    };

    const response = await ddb.send(new GetItemCommand(params));

    if (!response.Item) {
      // Return default settings if none exist
      const defaultSettings: SecuritySettings = {
        userId,
        orgId,
        mfaEnabled: false,
        sessionTimeout: 30,
        loginNotifications: true,
        failedLoginAlerts: true,
        deviceManagement: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      console.log(`✅ Returning default security settings for user ${userId}`);
      return NextResponse.json(defaultSettings);
    }

    const settings: SecuritySettings = {
      userId: response.Item.userId?.S || '',
      orgId: response.Item.orgId?.S || '',
      mfaEnabled: response.Item.mfaEnabled?.BOOL || false,
      mfaMethod: response.Item.mfaMethod?.S as SecuritySettings['mfaMethod'],
      sessionTimeout: Number(response.Item.sessionTimeout?.N) || 30,
      loginNotifications: response.Item.loginNotifications?.BOOL ?? true,
      failedLoginAlerts: response.Item.failedLoginAlerts?.BOOL ?? true,
      deviceManagement: response.Item.deviceManagement?.BOOL ?? true,
      passwordLastChanged: response.Item.passwordLastChanged?.S,
      loginAttempts: response.Item.loginAttempts?.N ? Number(response.Item.loginAttempts.N) : 0,
      lockoutUntil: response.Item.lockoutUntil?.S,
      createdAt: response.Item.createdAt?.S || '',
      updatedAt: response.Item.updatedAt?.S || '',
    };

    console.log(`✅ Fetched security settings for user ${userId}`);
    return NextResponse.json(settings);

  } catch (err: any) {
    console.error("❌ Error fetching security settings:", err);
    return NextResponse.json(
      { error: "Failed to fetch security settings", details: err.message },
      { status: 500 }
    );
  }
}

// PUT - Update security settings
export async function PUT(req: Request) {
  try {
    console.log("📝 PUT /api/security/settings - Updating security settings");
    
    const orgId = req.headers.get('x-org-id');
    const authHeader = req.headers.get('authorization');
    
    if (!orgId || !authHeader) {
      return NextResponse.json(
        { error: "Organization ID and authorization are required" },
        { status: 400 }
      );
    }

    const userId = getUserIdFromToken(authHeader);
    if (!userId) {
      return NextResponse.json(
        { error: "Invalid authentication token" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      mfaEnabled,
      mfaMethod,
      sessionTimeout,
      loginNotifications,
      failedLoginAlerts,
      deviceManagement
    } = body;

    const now = new Date().toISOString();

    // Check if settings exist
    const getParams = {
      TableName: SECURITY_SETTINGS_TABLE,
      Key: {
        userId: { S: userId },
        orgId: { S: orgId },
      },
    };

    const existingSettings = await ddb.send(new GetItemCommand(getParams));

    if (existingSettings.Item) {
      // Update existing settings
      const updateParams = {
        TableName: SECURITY_SETTINGS_TABLE,
        Key: {
          userId: { S: userId },
          orgId: { S: orgId },
        },
        UpdateExpression: 'SET mfaEnabled = :mfaEnabled, sessionTimeout = :sessionTimeout, loginNotifications = :loginNotifications, failedLoginAlerts = :failedLoginAlerts, deviceManagement = :deviceManagement, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':mfaEnabled': { BOOL: mfaEnabled },
          ':sessionTimeout': { N: sessionTimeout.toString() },
          ':loginNotifications': { BOOL: loginNotifications },
          ':failedLoginAlerts': { BOOL: failedLoginAlerts },
          ':deviceManagement': { BOOL: deviceManagement },
          ':updatedAt': { S: now },
        },
      };

      // Add MFA method if provided
      if (mfaMethod) {
        updateParams.UpdateExpression += ', mfaMethod = :mfaMethod';
        updateParams.ExpressionAttributeValues[':mfaMethod'] = { S: mfaMethod };
      }

      await ddb.send(new UpdateItemCommand(updateParams));
    } else {
      // Create new settings
      const putParams = {
        TableName: SECURITY_SETTINGS_TABLE,
        Item: {
          userId: { S: userId },
          orgId: { S: orgId },
          mfaEnabled: { BOOL: mfaEnabled },
          sessionTimeout: { N: sessionTimeout.toString() },
          loginNotifications: { BOOL: loginNotifications },
          failedLoginAlerts: { BOOL: failedLoginAlerts },
          deviceManagement: { BOOL: deviceManagement },
          loginAttempts: { N: '0' },
          createdAt: { S: now },
          updatedAt: { S: now },
        },
      };

      if (mfaMethod) {
        putParams.Item.mfaMethod = { S: mfaMethod };
      }

      await ddb.send(new PutItemCommand(putParams));
    }

    console.log(`✅ Updated security settings for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: "Security settings updated successfully"
    });

  } catch (err: any) {
    console.error("❌ Error updating security settings:", err);
    return NextResponse.json(
      { error: "Failed to update security settings", details: err.message },
      { status: 500 }
    );
  }
}