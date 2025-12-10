import { NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/client-dynamodb";
import { ddb, extractOrgId, TABLES } from "@/lib/aws";
import { mapEndpointEventItem } from "@/lib/db-mappers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const orgId = extractOrgId(req);
    if (!orgId) {
      return NextResponse.json({ error: "organizationId required" }, { status: 401 });
    }

    const deviceId = url.searchParams.get("deviceId");
    const userEmail = url.searchParams.get("userEmail");
    const limit = Math.min(200, parseInt(url.searchParams.get("limit") || "100", 10));

    const filters: string[] = ["organizationId = :orgId"];
    const values: Record<string, any> = { ":orgId": { S: orgId } };

    if (deviceId) {
      filters.push("deviceId = :deviceId");
      values[":deviceId"] = { S: deviceId };
    }
    if (userEmail) {
      filters.push("userEmail = :userEmail");
      values[":userEmail"] = { S: userEmail };
    }

    const command = new ScanCommand({
      TableName: TABLES.ENDPOINT_EVENTS || "EndpointEvents",
      FilterExpression: filters.join(" AND "),
      ExpressionAttributeValues: values,
      Limit: limit,
    });

    const data = await ddb.send(command);
    const events = (data.Items || []).map(mapEndpointEventItem);
    return NextResponse.json(events);
  } catch (error: any) {
    console.error("[GET /api/endpoint-events] failed", error);
    return NextResponse.json(
      { error: "Failed to list endpoint events", details: error.message },
      { status: 500 }
    );
  }
}
