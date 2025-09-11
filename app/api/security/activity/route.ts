export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

// Environment variables
const SECURITY_ACTIVITY_TABLE = process.env.SECURITY_ACTIVITY_TABLE_NAME || "SecurityActivity";

console.log("🔧 Security Activity API starting with table:", SECURITY_ACTIVITY_TABLE);

// DynamoDB client with default credential provider chain
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });

export interface SecurityActivity {
  activityId: string;
  userId: string;
  orgId: string;
  type: 'login_success' | 'login_failed' | 'logout' | 'password_change' | 'mfa_enabled' | 'mfa_disabled' | 'device_added' | 'device_removed' | 'settings_changed';
  description: string;
  ipAddress: string;
  userAgent: string;
  deviceInfo?: {
    browser: string;
    os: string;
    deviceType: string;
  };
  location?: {
    country: string;
    city: string;
    region: string;
  };
  metadata?: any;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
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
  
  let browser = 'Unknown';
  if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
  else if (ua.includes('edg')) browser = 'Edge';
  else if (ua.includes('opera')) browser = 'Opera';

  let os = 'Unknown';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac os')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

  let deviceType = 'desktop';
  if (ua.includes('mobile')) deviceType = 'mobile';
  else if (ua.includes('tablet') || ua.includes('ipad')) deviceType = 'tablet';

  return { browser, os, deviceType };
}

// Helper function to get IP geolocation (mock implementation)
async function getLocationFromIP(ip: string) {
  // In a real implementation, you'd use a service like ipinfo.io or MaxMind
  return {
    country: 'United States',
    city: 'San Francisco',
    region: 'California'
  };
}

// GET - Fetch security activity log for a user
export async function GET(req: Request) {
  try {
    console.log("🔍 GET /api/security/activity - Fetching security activity");
    
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
    const limit = parseInt(searchParams.get('limit') || '50');
    const activityType = searchParams.get('type'); // Filter by activity type

    // Query security activity for the user
    const params = {
      TableName: SECURITY_ACTIVITY_TABLE,
      IndexName: 'user-timestamp-index', // Assuming a GSI on userId-timestamp
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': { S: userId },
        ':orgId': { S: orgId },
      },
      FilterExpression: 'orgId = :orgId' + (activityType ? ' AND #type = :type' : ''),
      ScanIndexForward: false, // Most recent first
      Limit: limit,
    };

    if (activityType) {
      params.ExpressionAttributeValues[':type'] = { S: activityType };
      (params as any).ExpressionAttributeNames = { '#type': 'type' }; // 'type' is a reserved word
    }

    const response = await ddb.send(new QueryCommand(params));

    const activities: SecurityActivity[] = (response.Items || []).map(item => ({
      activityId: item.activityId?.S || '',
      userId: item.userId?.S || '',
      orgId: item.orgId?.S || '',
      type: item.type?.S as SecurityActivity['type'] || 'login_success',
      description: item.description?.S || '',
      ipAddress: item.ipAddress?.S || '',
      userAgent: item.userAgent?.S || '',
      deviceInfo: item.deviceInfo?.M ? {
        browser: item.deviceInfo.M.browser?.S || '',
        os: item.deviceInfo.M.os?.S || '',
        deviceType: item.deviceInfo.M.deviceType?.S || '',
      } : undefined,
      location: item.location?.M ? {
        country: item.location.M.country?.S || '',
        city: item.location.M.city?.S || '',
        region: item.location.M.region?.S || '',
      } : undefined,
      metadata: item.metadata?.S ? JSON.parse(item.metadata.S) : undefined,
      timestamp: item.timestamp?.S || '',
      severity: item.severity?.S as SecurityActivity['severity'] || 'low',
    }));

    console.log(`✅ Fetched ${activities.length} security activities for user ${userId}`);
    
    return NextResponse.json({ activities });

  } catch (err: any) {
    console.error("❌ Error fetching security activity:", err);
    return NextResponse.json(
      { error: "Failed to fetch security activity", details: err.message },
      { status: 500 }
    );
  }
}

// POST - Log a new security activity
export async function POST(req: Request) {
  try {
    console.log("📝 POST /api/security/activity - Logging security activity");
    
    const orgId = req.headers.get('x-org-id');
    const authHeader = req.headers.get('authorization');
    const userAgent = req.headers.get('user-agent') || '';
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
    
    if (!orgId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 }
      );
    }

    // For some activities (like failed logins), we might not have a valid token
    let userId = '';
    if (authHeader) {
      userId = getUserIdFromToken(authHeader);
    }

    const body = await req.json();
    const { type, description, targetUserId, severity = 'low', metadata } = body;

    // Use targetUserId if provided (for admin actions), otherwise use authenticated userId
    const actualUserId = targetUserId || userId;

    if (!actualUserId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    if (!type || !description) {
      return NextResponse.json(
        { error: "Activity type and description are required" },
        { status: 400 }
      );
    }

    const activityId = `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const deviceInfo = parseUserAgent(userAgent);
    const location = await getLocationFromIP(clientIP);

    const putParams = {
      TableName: SECURITY_ACTIVITY_TABLE,
      Item: {
        activityId: { S: activityId },
        userId: { S: actualUserId },
        orgId: { S: orgId },
        type: { S: type },
        description: { S: description },
        ipAddress: { S: clientIP },
        userAgent: { S: userAgent },
        deviceInfo: {
          M: {
            browser: { S: deviceInfo.browser },
            os: { S: deviceInfo.os },
            deviceType: { S: deviceInfo.deviceType },
          }
        },
        location: {
          M: {
            country: { S: location.country },
            city: { S: location.city },
            region: { S: location.region },
          }
        },
        severity: { S: severity },
        timestamp: { S: now },
      },
    };

    if (metadata) {
      (putParams.Item as any).metadata = { S: JSON.stringify(metadata) };
    }

    await ddb.send(new PutItemCommand(putParams));

    console.log(`✅ Logged security activity ${activityId} for user ${actualUserId}`);

    return NextResponse.json({
      success: true,
      activityId,
      message: "Security activity logged successfully"
    });

  } catch (err: any) {
    console.error("❌ Error logging security activity:", err);
    return NextResponse.json(
      { error: "Failed to log security activity", details: err.message },
      { status: 500 }
    );
  }
}