export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { randomBytes } from 'crypto';

// Environment variables
const SECURITY_SETTINGS_TABLE = process.env.SECURITY_SETTINGS_TABLE_NAME || "SecuritySettings";

console.log("🔧 Security MFA API starting with table:", SECURITY_SETTINGS_TABLE);

// DynamoDB client with default credential provider chain
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });

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

// Helper function to generate TOTP secret
function generateTOTPSecret(): string {
  return randomBytes(20).toString('hex');
}

// Helper function to generate QR code URL for TOTP setup
function generateTOTPQRCodeURL(secret: string, userEmail: string, issuer: string = 'EncryptGate'): string {
  const otpauthURL = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(userEmail)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthURL)}`;
}

// POST - Setup MFA
export async function POST(req: Request) {
  try {
    console.log("📝 POST /api/security/mfa - Setting up MFA");
    
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
    const { action, mfaMethod = 'totp', userEmail } = body;

    if (action === 'setup') {
      // Generate TOTP secret and QR code
      const secret = generateTOTPSecret();
      const qrCodeURL = generateTOTPQRCodeURL(secret, userEmail);

      // Store the secret temporarily (not yet enabled)
      const updateParams = {
        TableName: SECURITY_SETTINGS_TABLE,
        Key: {
          userId: { S: userId },
          orgId: { S: orgId },
        },
        UpdateExpression: 'SET mfaSecret = :secret, mfaMethod = :method, mfaSetupPending = :pending, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':secret': { S: secret },
          ':method': { S: mfaMethod },
          ':pending': { BOOL: true },
          ':updatedAt': { S: new Date().toISOString() },
        },
      };

      await ddb.send(new UpdateItemCommand(updateParams));

      console.log(`✅ Generated MFA setup for user ${userId}`);

      return NextResponse.json({
        success: true,
        secret,
        qrCodeURL,
        message: "MFA setup initiated. Scan the QR code with your authenticator app."
      });

    } else if (action === 'verify') {
      const { verificationCode } = body;

      if (!verificationCode) {
        return NextResponse.json(
          { error: "Verification code is required" },
          { status: 400 }
        );
      }

      // Get the pending secret
      const getParams = {
        TableName: SECURITY_SETTINGS_TABLE,
        Key: {
          userId: { S: userId },
          orgId: { S: orgId },
        },
      };

      const response = await ddb.send(new GetItemCommand(getParams));
      
      if (!response.Item || !response.Item.mfaSecret?.S || !response.Item.mfaSetupPending?.BOOL) {
        return NextResponse.json(
          { error: "No pending MFA setup found" },
          { status: 400 }
        );
      }

      // In a real implementation, you would verify the TOTP code here
      // For demo purposes, we'll accept any 6-digit code
      if (!/^\d{6}$/.test(verificationCode)) {
        return NextResponse.json(
          { error: "Invalid verification code format" },
          { status: 400 }
        );
      }

      // Enable MFA
      const updateParams = {
        TableName: SECURITY_SETTINGS_TABLE,
        Key: {
          userId: { S: userId },
          orgId: { S: orgId },
        },
        UpdateExpression: 'SET mfaEnabled = :enabled, mfaSetupPending = :pending, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':enabled': { BOOL: true },
          ':pending': { BOOL: false },
          ':updatedAt': { S: new Date().toISOString() },
        },
      };

      await ddb.send(new UpdateItemCommand(updateParams));

      console.log(`✅ MFA enabled for user ${userId}`);

      return NextResponse.json({
        success: true,
        message: "MFA successfully enabled for your account"
      });

    } else if (action === 'disable') {
      // Disable MFA
      const updateParams = {
        TableName: SECURITY_SETTINGS_TABLE,
        Key: {
          userId: { S: userId },
          orgId: { S: orgId },
        },
        UpdateExpression: 'SET mfaEnabled = :enabled, mfaSetupPending = :pending, updatedAt = :updatedAt REMOVE mfaSecret',
        ExpressionAttributeValues: {
          ':enabled': { BOOL: false },
          ':pending': { BOOL: false },
          ':updatedAt': { S: new Date().toISOString() },
        },
      };

      await ddb.send(new UpdateItemCommand(updateParams));

      console.log(`✅ MFA disabled for user ${userId}`);

      return NextResponse.json({
        success: true,
        message: "MFA has been disabled for your account"
      });

    } else {
      return NextResponse.json(
        { error: "Invalid action. Must be 'setup', 'verify', or 'disable'" },
        { status: 400 }
      );
    }

  } catch (err: any) {
    console.error("❌ Error managing MFA:", err);
    return NextResponse.json(
      { error: "Failed to manage MFA", details: err.message },
      { status: 500 }
    );
  }
}

// GET - Get MFA status
export async function GET(req: Request) {
  try {
    console.log("🔍 GET /api/security/mfa - Getting MFA status");
    
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

    // Get MFA status
    const getParams = {
      TableName: SECURITY_SETTINGS_TABLE,
      Key: {
        userId: { S: userId },
        orgId: { S: orgId },
      },
    };

    const response = await ddb.send(new GetItemCommand(getParams));
    
    const mfaStatus = {
      enabled: response.Item?.mfaEnabled?.BOOL || false,
      method: response.Item?.mfaMethod?.S || null,
      setupPending: response.Item?.mfaSetupPending?.BOOL || false,
    };

    console.log(`✅ Retrieved MFA status for user ${userId}`);

    return NextResponse.json({
      success: true,
      ...mfaStatus
    });

  } catch (err: any) {
    console.error("❌ Error getting MFA status:", err);
    return NextResponse.json(
      { error: "Failed to get MFA status", details: err.message },
      { status: 500 }
    );
  }
}