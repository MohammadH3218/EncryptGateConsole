export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import {
  DynamoDBClient,
  UpdateItemCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";

// Environment variables
const NOTIFICATIONS_TABLE = process.env.NOTIFICATIONS_TABLE_NAME || "Notifications";

console.log("🔧 Notification [id] API starting with table:", NOTIFICATIONS_TABLE);

// DynamoDB client with default credential provider chain
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });

// PATCH - Mark notification as read/unread
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    console.log(`📝 PATCH /api/notifications/${id} - Updating notification`);
    
    const orgId = req.headers.get('x-org-id');
    const userId = req.headers.get('x-user-id');

    if (!orgId || !userId) {
      return NextResponse.json(
        { error: "Organization ID and User ID are required" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { isRead } = body;

    if (typeof isRead !== 'boolean') {
      return NextResponse.json(
        { error: "isRead field is required and must be boolean" },
        { status: 400 }
      );
    }

    // First verify the notification exists and belongs to the user
    const getParams = {
      TableName: NOTIFICATIONS_TABLE,
      Key: {
        id: { S: id },
      },
    };

    const getResponse = await ddb.send(new GetItemCommand(getParams));
    
    if (!getResponse.Item) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (getResponse.Item.userId?.S !== userId || getResponse.Item.orgId?.S !== orgId) {
      return NextResponse.json(
        { error: "Unauthorized to modify this notification" },
        { status: 403 }
      );
    }

    // Update the notification
    const updateParams = {
      TableName: NOTIFICATIONS_TABLE,
      Key: {
        id: { S: id },
      },
      UpdateExpression: 'SET isRead = :isRead, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':isRead': { BOOL: isRead },
        ':updatedAt': { S: new Date().toISOString() },
      },
    };

    await ddb.send(new UpdateItemCommand(updateParams));

    console.log(`✅ Updated notification ${id} - isRead: ${isRead}`);

    return NextResponse.json({
      success: true,
      message: `Notification marked as ${isRead ? 'read' : 'unread'}`
    });

  } catch (err: any) {
    console.error(`❌ Error updating notification ${params.id}:`, err);
    return NextResponse.json(
      { error: "Failed to update notification", details: err.message },
      { status: 500 }
    );
  }
}

// DELETE - Delete a specific notification
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    console.log(`🗑️ DELETE /api/notifications/${id} - Deleting notification`);
    
    const orgId = req.headers.get('x-org-id');
    const userId = req.headers.get('x-user-id');

    if (!orgId || !userId) {
      return NextResponse.json(
        { error: "Organization ID and User ID are required" },
        { status: 400 }
      );
    }

    // First verify the notification exists and belongs to the user
    const getParams = {
      TableName: NOTIFICATIONS_TABLE,
      Key: {
        id: { S: id },
      },
    };

    const getResponse = await ddb.send(new GetItemCommand(getParams));
    
    if (!getResponse.Item) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (getResponse.Item.userId?.S !== userId || getResponse.Item.orgId?.S !== orgId) {
      return NextResponse.json(
        { error: "Unauthorized to delete this notification" },
        { status: 403 }
      );
    }

    // Delete the notification (we can use UpdateItem with DELETE action or implement soft delete)
    const updateParams = {
      TableName: NOTIFICATIONS_TABLE,
      Key: {
        id: { S: id },
      },
      UpdateExpression: 'SET deleted = :deleted, deletedAt = :deletedAt',
      ExpressionAttributeValues: {
        ':deleted': { BOOL: true },
        ':deletedAt': { S: new Date().toISOString() },
      },
    };

    await ddb.send(new UpdateItemCommand(updateParams));

    console.log(`✅ Soft deleted notification ${id}`);

    return NextResponse.json({
      success: true,
      message: "Notification deleted successfully"
    });

  } catch (err: any) {
    console.error(`❌ Error deleting notification ${params.id}:`, err);
    return NextResponse.json(
      { error: "Failed to delete notification", details: err.message },
      { status: 500 }
    );
  }
}