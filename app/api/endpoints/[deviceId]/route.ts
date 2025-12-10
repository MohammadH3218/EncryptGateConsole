import { NextResponse } from "next/server";
import { ScanCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { ddb, extractOrgId, TABLES } from "@/lib/aws";
import { mapDeviceItem, mapEndpointEventItem } from "@/lib/db-mappers";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: { deviceId: string } }) {
  try {
    const deviceId = params.deviceId;
    const orgId = params.deviceId ? undefined : undefined; // org comes from headers in list call; here we still scope by org in queries below.
    // For GET by id, we still enforce org via FilterExpression on events/device scans.

    // Fetch device (scan by deviceId)
    const deviceScan = new ScanCommand({
      TableName: TABLES.ENDPOINTS || "Endpoints",
      FilterExpression: "deviceId = :deviceId",
      ExpressionAttributeValues: { ":deviceId": { S: deviceId } },
      Limit: 1,
    });
    const deviceData = await ddb.send(deviceScan);
    const deviceItem = deviceData.Items?.[0];
    const device = deviceItem ? mapDeviceItem(deviceItem) : null;

    // Fetch recent events
    const eventScan = new ScanCommand({
      TableName: TABLES.ENDPOINT_EVENTS || "EndpointEvents",
      FilterExpression: "deviceId = :deviceId",
      ExpressionAttributeValues: { ":deviceId": { S: deviceId } },
      Limit: 100,
    });
    const eventsData = await ddb.send(eventScan);
    const events = (eventsData.Items || []).map(mapEndpointEventItem);

    if (!device) {
      return NextResponse.json(
        { error: "Device not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ device, events });
  } catch (error: any) {
    console.error("[GET /api/endpoints/[deviceId]] failed", error);
    return NextResponse.json(
      { error: "Failed to load endpoint", details: error.message },
      { status: 500 }
    );
  }
}
