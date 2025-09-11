export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  BatchWriteItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";

// Environment variables
const NOTIFICATIONS_TABLE = process.env.NOTIFICATIONS_TABLE_NAME || "Notifications";

console.log("🔧 Notifications API starting with table:", NOTIFICATIONS_TABLE);

// DynamoDB client with default credential provider chain
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });

export interface Notification {
  id: string;
  orgId: string;
  userId: string;
  type: 'critical_email' | 'pushed_request' | 'assignment' | 'detection' | 'system_update' | 'weekly_report';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  data?: any; // Additional data specific to notification type
}

// GET - Fetch notifications for a user
export async function GET(req: Request) {
  try {
    console.log("🔍 GET /api/notifications - Fetching user notifications");
    
    // Extract orgId and userId from headers
    const orgId = req.headers.get('x-org-id');
    const userId = req.headers.get('x-user-id');

    if (!orgId || !userId) {
      return NextResponse.json(
        { error: "Organization ID and User ID are required" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const includeRead = searchParams.get('includeRead') === 'true';

    // Query notifications for the user
    const params = {
      TableName: NOTIFICATIONS_TABLE,
      IndexName: 'user-created-index', // Assuming a GSI on userId-createdAt
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': { S: userId },
        ':orgId': { S: orgId },
      },
      FilterExpression: 'orgId = :orgId' + (includeRead ? '' : ' AND isRead = :false'),
      ...(includeRead ? {} : {
        ExpressionAttributeValues: {
          ...{':userId': { S: userId }, ':orgId': { S: orgId }},
          ':false': { BOOL: false }
        }
      }),
      ScanIndexForward: false, // Most recent first
      Limit: limit,
    };

    if (!includeRead) {
      params.ExpressionAttributeValues[':false'] = { BOOL: false };
    }

    const response = await ddb.send(new QueryCommand(params));

    const notifications: Notification[] = (response.Items || []).map(item => ({
      id: item.id?.S || '',
      orgId: item.orgId?.S || '',
      userId: item.userId?.S || '',
      type: item.type?.S as Notification['type'] || 'system_update',
      title: item.title?.S || '',
      message: item.message?.S || '',
      isRead: item.isRead?.BOOL || false,
      createdAt: item.createdAt?.S || '',
      data: item.data?.S ? JSON.parse(item.data.S) : undefined,
    }));

    console.log(`✅ Fetched ${notifications.length} notifications for user ${userId}`);
    
    return NextResponse.json({
      notifications,
      unreadCount: notifications.filter(n => !n.isRead).length,
    });

  } catch (err: any) {
    console.error("❌ Error fetching notifications:", err);
    return NextResponse.json(
      { error: "Failed to fetch notifications", details: err.message },
      { status: 500 }
    );
  }
}

// POST - Create a new notification
export async function POST(req: Request) {
  try {
    console.log("📝 POST /api/notifications - Creating new notification");
    
    const orgId = req.headers.get('x-org-id');
    if (!orgId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { userId, type, title, message, data } = body;

    if (!userId || !type || !title || !message) {
      return NextResponse.json(
        { error: "Missing required fields: userId, type, title, message" },
        { status: 400 }
      );
    }

    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const putParams = {
      TableName: NOTIFICATIONS_TABLE,
      Item: {
        id: { S: notificationId },
        orgId: { S: orgId },
        userId: { S: userId },
        type: { S: type },
        title: { S: title },
        message: { S: message },
        isRead: { BOOL: false },
        createdAt: { S: now },
        ...(data && { data: { S: JSON.stringify(data) } }),
      },
    };

    await ddb.send(new PutItemCommand(putParams));

    console.log(`✅ Created notification ${notificationId} for user ${userId}`);

    return NextResponse.json({
      success: true,
      notificationId,
      message: "Notification created successfully"
    });

  } catch (err: any) {
    console.error("❌ Error creating notification:", err);
    return NextResponse.json(
      { error: "Failed to create notification", details: err.message },
      { status: 500 }
    );
  }
}

// DELETE - Clear all notifications or selected ones
export async function DELETE(req: Request) {
  try {
    console.log("🗑️ DELETE /api/notifications - Deleting notifications");
    
    const orgId = req.headers.get('x-org-id');
    const userId = req.headers.get('x-user-id');

    if (!orgId || !userId) {
      return NextResponse.json(
        { error: "Organization ID and User ID are required" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const notificationIds = searchParams.get('ids')?.split(',') || [];
    const clearAll = searchParams.get('clearAll') === 'true';

    if (clearAll) {
      // First, get all notifications for the user
      const queryParams = {
        TableName: NOTIFICATIONS_TABLE,
        IndexName: 'user-created-index',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': { S: userId },
          ':orgId': { S: orgId },
        },
        FilterExpression: 'orgId = :orgId',
      };

      const response = await ddb.send(new QueryCommand(queryParams));
      const notifications = response.Items || [];

      // Batch delete all notifications
      if (notifications.length > 0) {
        const deleteRequests = notifications.map(item => ({
          DeleteRequest: {
            Key: {
              id: { S: item.id?.S || '' },
            }
          }
        }));

        // Process in batches of 25 (DynamoDB limit)
        for (let i = 0; i < deleteRequests.length; i += 25) {
          const batch = deleteRequests.slice(i, i + 25);
          await ddb.send(new BatchWriteItemCommand({
            RequestItems: {
              [NOTIFICATIONS_TABLE]: batch
            }
          }));
        }
      }

      console.log(`✅ Cleared all ${notifications.length} notifications for user ${userId}`);
      
      return NextResponse.json({
        success: true,
        deletedCount: notifications.length,
        message: "All notifications cleared"
      });

    } else if (notificationIds.length > 0) {
      // Delete specific notifications
      const deleteRequests = notificationIds.map(id => ({
        DeleteRequest: {
          Key: {
            id: { S: id },
          }
        }
      }));

      // Process in batches of 25
      for (let i = 0; i < deleteRequests.length; i += 25) {
        const batch = deleteRequests.slice(i, i + 25);
        await ddb.send(new BatchWriteItemCommand({
          RequestItems: {
            [NOTIFICATIONS_TABLE]: batch
          }
        }));
      }

      console.log(`✅ Deleted ${notificationIds.length} specific notifications`);
      
      return NextResponse.json({
        success: true,
        deletedCount: notificationIds.length,
        message: "Selected notifications deleted"
      });
    }

    return NextResponse.json(
      { error: "No notifications specified for deletion" },
      { status: 400 }
    );

  } catch (err: any) {
    console.error("❌ Error deleting notifications:", err);
    return NextResponse.json(
      { error: "Failed to delete notifications", details: err.message },
      { status: 500 }
    );
  }
}