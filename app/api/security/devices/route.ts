export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";

// Environment variables
const USER_SESSIONS_TABLE = process.env.USER_SESSIONS_TABLE_NAME || "UserSessions";

console.log("🔧 Security Devices API starting with table:", USER_SESSIONS_TABLE);

// DynamoDB client with default credential provider chain
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });

export interface DeviceSession {
  sessionId: string;
  userId: string;
  orgId: string;
  deviceInfo: {
    browser: string;
    os: string;
    deviceType: 'desktop' | 'mobile' | 'tablet';
    userAgent: string;
  };
  ipAddress: string;
  location?: {
    country: string;
    city: string;
    region: string;
  };
  isActive: boolean;
  isCurrent: boolean;
  lastActivity: string;
  loginTime: string;
  expiresAt: string;
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

// Helper function to parse User-Agent string
function parseUserAgent(userAgent: string) {
  const ua = userAgent.toLowerCase();
  
  // Detect browser
  let browser = 'Unknown';
  if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
  else if (ua.includes('edg')) browser = 'Edge';
  else if (ua.includes('opera')) browser = 'Opera';

  // Detect OS
  let os = 'Unknown';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac os')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

  // Detect device type
  let deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop';
  if (ua.includes('mobile')) deviceType = 'mobile';
  else if (ua.includes('tablet') || ua.includes('ipad')) deviceType = 'tablet';

  return { browser, os, deviceType };
}

// Helper function to get IP geolocation (mock implementation)
async function getLocationFromIP(ip: string) {
  // In a real implementation, you'd use a service like ipinfo.io or MaxMind
  // For now, return mock data
  return {
    country: 'United States',
    city: 'San Francisco',
    region: 'California'
  };
}

// GET - Fetch user devices/sessions
export async function GET(req: Request) {
  try {
    console.log("🔍 GET /api/security/devices - Fetching user devices");
    
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

    // Query user sessions
    const params = {
      TableName: USER_SESSIONS_TABLE,
      IndexName: 'user-lastActivity-index', // Assuming a GSI on userId-lastActivity
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': { S: userId },
        ':orgId': { S: orgId },
        ':now': { S: new Date().toISOString() },
      },
      FilterExpression: 'orgId = :orgId AND expiresAt > :now',
      ScanIndexForward: false, // Most recent first
      Limit: 20,
    };

    const response = await ddb.send(new QueryCommand(params));

    const devices: DeviceSession[] = (response.Items || []).map(item => ({
      sessionId: item.sessionId?.S || '',
      userId: item.userId?.S || '',
      orgId: item.orgId?.S || '',
      deviceInfo: {
        browser: item.browser?.S || '',
        os: item.os?.S || '',
        deviceType: item.deviceType?.S as DeviceSession['deviceInfo']['deviceType'] || 'desktop',
        userAgent: item.userAgent?.S || '',
      },
      ipAddress: item.ipAddress?.S || '',
      location: item.location?.M ? {
        country: item.location.M.country?.S || '',
        city: item.location.M.city?.S || '',
        region: item.location.M.region?.S || '',
      } : undefined,
      isActive: item.isActive?.BOOL ?? false,
      isCurrent: item.isCurrent?.BOOL ?? false,
      lastActivity: item.lastActivity?.S || '',
      loginTime: item.loginTime?.S || '',
      expiresAt: item.expiresAt?.S || '',
    }));

    console.log(`✅ Fetched ${devices.length} devices for user ${userId}`);
    
    return NextResponse.json({ devices });

  } catch (err: any) {
    console.error("❌ Error fetching devices:", err);
    return NextResponse.json(
      { error: "Failed to fetch devices", details: err.message },
      { status: 500 }
    );
  }
}

// POST - Create/register a new device session
export async function POST(req: Request) {
  try {
    console.log("📝 POST /api/security/devices - Creating device session");
    
    const orgId = req.headers.get('x-org-id');
    const authHeader = req.headers.get('authorization');
    const userAgent = req.headers.get('user-agent') || '';
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
    
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
    const { sessionTimeout = 30, markAsCurrent = false } = body;

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + sessionTimeout * 60 * 1000);

    const deviceInfo = parseUserAgent(userAgent);
    const location = await getLocationFromIP(clientIP);

    // Mark other sessions as not current if this is the current session
    if (markAsCurrent) {
      const updateParams = {
        TableName: USER_SESSIONS_TABLE,
        IndexName: 'user-lastActivity-index',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': { S: userId },
          ':false': { BOOL: false },
        },
        UpdateExpression: 'SET isCurrent = :false',
      };
      
      // Note: In a real implementation, you'd need to scan and update each item individually
      // as DynamoDB doesn't support bulk updates on query results
    }

    const putParams = {
      TableName: USER_SESSIONS_TABLE,
      Item: {
        sessionId: { S: sessionId },
        userId: { S: userId },
        orgId: { S: orgId },
        browser: { S: deviceInfo.browser },
        os: { S: deviceInfo.os },
        deviceType: { S: deviceInfo.deviceType },
        userAgent: { S: userAgent },
        ipAddress: { S: clientIP },
        location: {
          M: {
            country: { S: location.country },
            city: { S: location.city },
            region: { S: location.region },
          }
        },
        isActive: { BOOL: true },
        isCurrent: { BOOL: markAsCurrent },
        lastActivity: { S: now.toISOString() },
        loginTime: { S: now.toISOString() },
        expiresAt: { S: expiresAt.toISOString() },
      },
    };

    await ddb.send(new PutItemCommand(putParams));

    console.log(`✅ Created device session ${sessionId} for user ${userId}`);

    return NextResponse.json({
      success: true,
      sessionId,
      message: "Device session created successfully"
    });

  } catch (err: any) {
    console.error("❌ Error creating device session:", err);
    return NextResponse.json(
      { error: "Failed to create device session", details: err.message },
      { status: 500 }
    );
  }
}

// DELETE - Remove a device session
export async function DELETE(req: Request) {
  try {
    console.log("🗑️ DELETE /api/security/devices - Removing device session");
    
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

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    // Verify the session belongs to the user before deleting
    const getParams = {
      TableName: USER_SESSIONS_TABLE,
      Key: {
        sessionId: { S: sessionId },
      },
    };

    const session = await ddb.send(new GetItemCommand(getParams));
    
    if (!session.Item || session.Item.userId?.S !== userId) {
      return NextResponse.json(
        { error: "Session not found or unauthorized" },
        { status: 404 }
      );
    }

    // Delete the session
    const deleteParams = {
      TableName: USER_SESSIONS_TABLE,
      Key: {
        sessionId: { S: sessionId },
      },
    };

    await ddb.send(new DeleteItemCommand(deleteParams));

    console.log(`✅ Deleted device session ${sessionId} for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: "Device session removed successfully"
    });

  } catch (err: any) {
    console.error("❌ Error removing device session:", err);
    return NextResponse.json(
      { error: "Failed to remove device session", details: err.message },
      { status: 500 }
    );
  }
}