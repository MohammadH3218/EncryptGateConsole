import { NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/client-dynamodb";
import { ddb, extractOrgId, TABLES } from "@/lib/aws";
import { mapDeviceItem } from "@/lib/db-mappers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const orgId = extractOrgId(req);
    if (!orgId) {
      return NextResponse.json({ error: "organizationId required" }, { status: 401 });
    }

    const status = url.searchParams.get("status");
    const minRisk = parseInt(url.searchParams.get("minRisk") || "0", 10);
    const maxRisk = parseInt(url.searchParams.get("maxRisk") || "100", 10);
    const limit = Math.min(200, parseInt(url.searchParams.get("limit") || "100", 10));

    const filters: string[] = ["organizationId = :orgId"];
    const values: Record<string, any> = { ":orgId": { S: orgId } };
    const names: Record<string, string> = {};

    if (status) {
      filters.push("#status = :status");
      values[":status"] = { S: status };
      names["#status"] = "status";
    }
    filters.push("riskScore BETWEEN :minRisk AND :maxRisk");
    values[":minRisk"] = { N: String(minRisk) };
    values[":maxRisk"] = { N: String(maxRisk) };

    const command = new ScanCommand({
      TableName: TABLES.ENDPOINTS || "Endpoints",
      FilterExpression: filters.join(" AND "),
      ExpressionAttributeValues: values,
      ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
      Limit: limit,
    });

    const data = await ddb.send(command);
    const devices = (data.Items || []).map(mapDeviceItem);
    return NextResponse.json(devices);
  } catch (error: any) {
    console.error("[GET /api/endpoints] failed", error);
    return NextResponse.json(
      { error: "Failed to list endpoints", details: error.message },
      { status: 500 }
    );
  }
}
