// app/api/email/[messageId]/route.ts - FIXED VERSION
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  UpdateItemCommand,
  ScanCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import { ddb, TABLES } from "@/lib/aws";

const EMAILS_TABLE = TABLES.EMAILS;

console.log("📧 Email [messageId] API initialized with table:", EMAILS_TABLE);

function extractStringArray(attribute: any): string[] {
  if (!attribute) return [];
  if (Array.isArray(attribute.SS)) return attribute.SS;
  if (attribute.S) return [attribute.S];
  if (Array.isArray(attribute.L)) {
    return attribute.L.map((item: any) => item.S || "").filter(Boolean);
  }
  return [];
}

function extractHeaders(attribute: any): Record<string, string> | undefined {
  if (!attribute?.M) return undefined;
  const entries = Object.entries(attribute.M);
  const headers: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof value === "object") {
      const str = value.S ?? value.N ?? undefined;
      if (str !== undefined) {
        headers[key] = String(str);
      }
    }
  }
  return headers;
}

function extractAttachments(
  attribute: any,
): Array<{ filename: string; size?: number }> | undefined {
  if (!attribute?.L) return undefined;
  const attachments: Array<{ filename: string; size?: number }> = [];
  for (const entry of attribute.L) {
    const data = entry.M || {};
    const filename = data.filename?.S || data.name?.S;
    if (!filename) continue;
    const size = data.size?.N ? Number(data.size.N) : undefined;
    attachments.push({ filename, size });
  }
  return attachments.length ? attachments : undefined;
}

// Helper function to normalize messageId (remove angle brackets if present)
function normalizeMessageId(messageId: string): string {
  // Remove angle brackets if they exist
  return messageId.replace(/^<|>$/g, '');
}

// Helper function to try multiple messageId variations (handles encoding issues)
function getMessageIdVariations(messageId: string): string[] {
  const variations: string[] = [messageId];
  
  // Try with spaces replaced by underscores (common encoding issue)
  if (messageId.includes(' ')) {
    variations.push(messageId.replace(/ /g, '_'));
  }
  
  // Try with underscores replaced by spaces
  if (messageId.includes('_')) {
    variations.push(messageId.replace(/_/g, ' '));
  }
  
  // Try with plus signs replaced by underscores
  if (messageId.includes('+')) {
    variations.push(messageId.replace(/\+/g, '_'));
  }
  
  // Try with underscores replaced by plus signs
  if (messageId.includes('_')) {
    variations.push(messageId.replace(/_/g, '+'));
  }
  
  // Remove duplicates
  return [...new Set(variations)];
}

// Helper function to find email by messageId
async function findEmailByMessageId(
  messageId: string,
): Promise<{ userId: string; receivedAt: string } | null> {
  try {
    // Get all variations to try (handles encoding issues like space/underscore/plus)
    const variations = getMessageIdVariations(messageId);
    const normalizedId = normalizeMessageId(messageId);
    if (normalizedId !== messageId && !variations.includes(normalizedId)) {
      variations.push(normalizedId);
    }
    
    // Also try with/without angle brackets
    const withBrackets = messageId.startsWith('<') ? messageId : `<${messageId}>`;
    const withoutBrackets = normalizeMessageId(messageId);
    if (!variations.includes(withBrackets)) variations.push(withBrackets);
    if (!variations.includes(withoutBrackets) && withoutBrackets !== messageId) {
      variations.push(withoutBrackets);
    }
    
    // Try each variation
    for (const variant of variations) {
      try {
        const scanCommand = new ScanCommand({
          TableName: EMAILS_TABLE,
          FilterExpression: "messageId = :messageId",
          ExpressionAttributeValues: {
            ":messageId": { S: variant },
          },
          ProjectionExpression: "userId, receivedAt",
        });

        const result = await ddb.send(scanCommand);

        if (result.Items && result.Items.length > 0) {
          const item = result.Items[0];
          console.log(`✅ Found email with messageId variant: ${variant}`);
          return {
            userId: item.userId?.S || "",
            receivedAt: item.receivedAt?.S || "",
          };
        }
      } catch (scanError) {
        // Continue to next variation
        console.warn(`⚠️ Error trying variant ${variant}:`, scanError);
      }
    }

    console.warn(`❌ Email not found with any variation. Tried: ${variations.join(', ')}`);
    return null;
  } catch (error) {
    console.error("❌ Error finding email by messageId:", error);
    return null;
  }
}

// GET: retrieve email detail by messageId (always returns JSON, even on failure)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  try {
    const { messageId: rawMessageId } = await params;
    console.log("📧 [GET /api/email/[messageId]] Raw messageId from params:", rawMessageId);
    
    // Decode URL-encoded messageId (safely handle already-decoded strings)
    let messageId: string;
    try {
      messageId = decodeURIComponent(rawMessageId);
      console.log("📧 Decoded messageId:", messageId);
    } catch (e) {
      // If decoding fails, use the raw value (might already be decoded)
      messageId = rawMessageId;
      console.log("📧 Using raw messageId (decoding failed):", messageId);
    }

    if (!messageId) {
      return NextResponse.json(
        { error: "Message ID is required" },
        { status: 400 },
      );
    }

    // Log the messageId variations we'll try
    const variations = getMessageIdVariations(messageId);
    console.log("📧 Will try messageId variations:", variations.slice(0, 5));

    // Normalize messageId (handle angle brackets)
    // The findEmailByMessageId function will try multiple formats
    const emailKey = await findEmailByMessageId(messageId);
    if (!emailKey) {
      return NextResponse.json(
        { error: "Email not found", messageId },
        { status: 404 },
      );
    }

    const getCommand = new GetItemCommand({
      TableName: EMAILS_TABLE,
      Key: {
        userId: { S: emailKey.userId },
        receivedAt: { S: emailKey.receivedAt },
      },
    });

    const result = await ddb.send(getCommand);
    const item = result.Item;

    if (!item) {
      return NextResponse.json(
        { error: "Email not found", messageId },
        { status: 404 },
      );
    }

    const email = {
      messageId: item.messageId?.S || messageId,
      subject:
        item.subject?.S ||
        item.subject?.M?.text?.S ||
        item.subject?.M?.value?.S ||
        "",
      sender: item.sender?.S || item.from?.S || "",
      recipients: extractStringArray(item.recipients || item.to),
      timestamp:
        item.receivedAt?.S ||
        item.timestamp?.S ||
        item.createdAt?.S ||
        new Date().toISOString(),
      body: item.body?.S || item.bodyText?.S || item.textBody?.S || "",
      htmlBody: item.htmlBody?.S || item.html?.S,
      headers: extractHeaders(item.headers),
      attachments: extractAttachments(item.attachments),
      direction: item.direction?.S || "unknown",
      status: item.status?.S || "unknown",
      flaggedCategory: item.flaggedCategory?.S,
      flaggedSeverity: item.flaggedSeverity?.S,
      investigationStatus: item.investigationStatus?.S,
      flaggedBy: item.flaggedBy?.S,
      investigationNotes: item.investigationNotes?.S,
      flaggedAt: item.flaggedAt?.S,
      detectionId: item.detectionId?.S,
      threatLevel: item.threatLevel?.S,
      flagged: ["ai", "manual"].includes(item.flaggedCategory?.S || ""),
    };

    return NextResponse.json({ ok: true, email });
  } catch (err: any) {
    console.error("Error fetching email by messageId:", err?.message || err);
    return NextResponse.json(
      {
        error: "Failed to fetch email",
        details: err?.message || "Internal Server Error",
      },
      { status: 500 },
    );
  }
}
// PATCH: update email flagged status and attributes
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  try {
    console.log("📧 PATCH /api/email/[messageId] - Updating email status...");

    const { messageId: rawMessageId } = await params;
    // Decode URL-encoded messageId (safely handle already-decoded strings)
    let messageId: string;
    try {
      messageId = decodeURIComponent(rawMessageId);
    } catch {
      // If decoding fails, use the raw value (might already be decoded)
      messageId = rawMessageId;
    }
    // Normalize messageId (handle angle brackets)
    // The findEmailByMessageId function will try multiple formats
    console.log("📧 Processing messageId:", messageId);

    const body = await request.json();
    console.log("📧 Request body:", body);
    const {
      flaggedCategory,
      flaggedSeverity,
      investigationStatus,
      detectionId,
      flaggedBy,
      investigationNotes,
    } = body;

    console.log("📝 Updating email status:", {
      messageId,
      flaggedCategory,
      flaggedSeverity,
      investigationStatus,
      detectionId,
    });

    // Validate flaggedCategory
    if (
      flaggedCategory &&
      !["none", "ai", "manual", "clean"].includes(flaggedCategory)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid flaggedCategory. Must be one of: none, ai, manual, clean",
        },
        { status: 400 },
      );
    }

    // Validate flaggedSeverity if provided
    if (
      flaggedSeverity &&
      !["critical", "high", "medium", "low"].includes(flaggedSeverity)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid flaggedSeverity. Must be one of: critical, high, medium, low",
        },
        { status: 400 },
      );
    }

    // Validate investigationStatus if provided
    if (
      investigationStatus &&
      !["new", "in_progress", "resolved"].includes(investigationStatus)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid investigationStatus. Must be one of: new, in_progress, resolved",
        },
        { status: 400 },
      );
    }

    // Find the email by messageId
    console.log("🔍 Searching for email with messageId:", messageId);
    const emailKey = await findEmailByMessageId(messageId);
    if (!emailKey) {
      console.log("❌ Email not found with messageId:", messageId);
      return NextResponse.json(
        { error: "Email not found", messageId },
        { status: 404 },
      );
    }
    console.log("✅ Found email key:", emailKey);

    // Build update expression dynamically
    const updateExpressions: string[] = [];
    const attributeValues: Record<string, any> = {};
    const attributeNames: Record<string, string> = {};

    if (flaggedCategory !== undefined) {
      updateExpressions.push("#flaggedCategory = :flaggedCategory");
      attributeNames["#flaggedCategory"] = "flaggedCategory";
      attributeValues[":flaggedCategory"] = { S: flaggedCategory };

      // If unflagging (setting to 'none' or 'clean'), remove severity and detection ID
      if (flaggedCategory === "none" || flaggedCategory === "clean") {
        updateExpressions.push("#flaggedSeverity = :null");
        updateExpressions.push("#detectionId = :null");
        attributeNames["#flaggedSeverity"] = "flaggedSeverity";
        attributeNames["#detectionId"] = "detectionId";
        attributeValues[":null"] = { NULL: true };
      }
    }

    if (
      flaggedSeverity !== undefined &&
      (flaggedCategory === "ai" || flaggedCategory === "manual")
    ) {
      updateExpressions.push("#flaggedSeverity = :flaggedSeverity");
      attributeNames["#flaggedSeverity"] = "flaggedSeverity";
      attributeValues[":flaggedSeverity"] = { S: flaggedSeverity };
    }

    if (investigationStatus !== undefined) {
      updateExpressions.push("#investigationStatus = :investigationStatus");
      attributeNames["#investigationStatus"] = "investigationStatus";
      attributeValues[":investigationStatus"] = { S: investigationStatus };
    }

    if (detectionId !== undefined) {
      updateExpressions.push("#detectionId = :detectionId");
      attributeNames["#detectionId"] = "detectionId";
      attributeValues[":detectionId"] = detectionId
        ? { S: detectionId }
        : { NULL: true };
    }

    if (flaggedBy !== undefined) {
      updateExpressions.push("#flaggedBy = :flaggedBy");
      attributeNames["#flaggedBy"] = "flaggedBy";
      attributeValues[":flaggedBy"] = { S: flaggedBy };
    }

    if (investigationNotes !== undefined) {
      updateExpressions.push("#investigationNotes = :investigationNotes");
      attributeNames["#investigationNotes"] = "investigationNotes";
      attributeValues[":investigationNotes"] = investigationNotes
        ? { S: investigationNotes }
        : { NULL: true };
    }

    // Always update the timestamp
    updateExpressions.push("#updatedAt = :updatedAt");
    attributeNames["#updatedAt"] = "updatedAt";
    attributeValues[":updatedAt"] = { S: new Date().toISOString() };

    // Add flaggedAt timestamp if flagging
    if (flaggedCategory === "ai" || flaggedCategory === "manual") {
      updateExpressions.push("#flaggedAt = :flaggedAt");
      attributeNames["#flaggedAt"] = "flaggedAt";
      attributeValues[":flaggedAt"] = { S: new Date().toISOString() };
    } else if (flaggedCategory === "none" || flaggedCategory === "clean") {
      updateExpressions.push("#flaggedAt = :null");
      attributeNames["#flaggedAt"] = "flaggedAt";
    }

    console.log("📝 Building DynamoDB update command:", {
      updateExpressions,
      attributeNames,
      attributeValues,
    });

    const updateCommand = new UpdateItemCommand({
      TableName: EMAILS_TABLE,
      Key: {
        userId: { S: emailKey.userId },
        receivedAt: { S: emailKey.receivedAt },
      },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeNames: attributeNames,
      ExpressionAttributeValues: attributeValues,
      ReturnValues: "ALL_NEW",
    });

    console.log("🔄 Sending DynamoDB update command...");
    const result = await ddb.send(updateCommand);
    console.log("✅ Email status updated successfully");

    return NextResponse.json({
      success: true,
      messageId,
      emailKey,
      updatedAttributes: {
        flaggedCategory,
        flaggedSeverity,
        investigationStatus,
        detectionId,
        flaggedBy,
        investigationNotes,
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("❌ [PATCH /api/email/[messageId]] error:", {
      message: err.message,
      code: err.code,
      name: err.name,
      stack: err.stack,
    });

    return NextResponse.json(
      {
        error: "Failed to update email status",
        details: err.message,
        code: err.code || err.name,
      },
      { status: 500 },
    );
  }
}
