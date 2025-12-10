import { NextResponse } from "next/server";
import { z } from "zod";
import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { ddb, extractOrgId, TABLES } from "@/lib/aws";
import { evaluateEventForDetection } from "@/lib/threat-rules";
import { v4 as uuid } from "uuid";
import { getDriver } from "@/lib/neo4j";

export const runtime = "nodejs";

const EndpointIngestSchema = z.object({
  deviceId: z.string().min(1),
  userEmail: z.string().email(),
  organizationId: z.string().optional(),
  timestamp: z.string(),
  eventType: z.enum(["PROCESS_START", "FILE_WRITE", "NETWORK_CONNECTION", "LOGIN", "OTHER"]),
  details: z.record(z.any()),
  relatedEmailMessageId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = EndpointIngestSchema.parse(body);
    const orgId = parsed.organizationId || extractOrgId(req);
    if (!orgId) {
      return NextResponse.json({ error: "organizationId required" }, { status: 401 });
    }

    const eventId = `evt-${uuid()}`;
    const now = new Date().toISOString();

    // Write to DynamoDB
    await ddb.send(new PutItemCommand({
      TableName: TABLES.ENDPOINT_EVENTS || "EndpointEvents",
      Item: {
        id: { S: eventId },
        deviceId: { S: parsed.deviceId },
        userEmail: { S: parsed.userEmail },
        organizationId: { S: orgId },
        timestamp: { S: parsed.timestamp },
        eventType: { S: parsed.eventType },
        details: { S: JSON.stringify(parsed.details || {}) },
        relatedEmailMessageId: parsed.relatedEmailMessageId ? { S: parsed.relatedEmailMessageId } : undefined,
        createdAt: { S: now },
      },
    }));

    // Upsert Device record with lastSeen/riskScore defaults
    await ddb.send(new PutItemCommand({
      TableName: TABLES.ENDPOINTS || "Endpoints",
      Item: {
        deviceId: { S: parsed.deviceId },
        organizationId: { S: orgId },
        hostname: { S: parsed.details?.hostname || parsed.deviceId },
        userEmail: { S: parsed.userEmail },
        os: { S: parsed.details?.os || "other" },
        lastSeen: { S: parsed.timestamp },
        riskScore: { N: String(parsed.details?.riskScore || 0) },
        status: { S: parsed.details?.status || "healthy" },
        updatedAt: { S: now },
      },
    }));

    // Write to Neo4j
    try {
      const driver = await getDriver();
      const session = driver.session();
      await session.run(
        `
        MERGE (u:User {email:$userEmail, orgId:$orgId})
        MERGE (d:Device {deviceId:$deviceId, orgId:$orgId})
          ON CREATE SET d.hostname = $hostname, d.os = $os, d.lastSeen = datetime($timestamp)
          ON MATCH SET d.lastSeen = datetime($timestamp), d.hostname = coalesce(d.hostname, $hostname), d.os = coalesce(d.os, $os)
        MERGE (u)-[:USES_DEVICE]->(d)
        MERGE (evt:EndpointEvent {id:$eventId, orgId:$orgId})
          SET evt.eventType = $eventType, evt.timestamp = datetime($timestamp), evt.details = $details
        MERGE (d)-[:HAS_EVENT]->(evt)
        FOREACH (msgId IN CASE WHEN $relatedEmailMessageId IS NULL THEN [] ELSE [$relatedEmailMessageId] END |
          MERGE (e:Email {messageId:msgId, orgId:$orgId})
          MERGE (evt)-[:RELATED_TO_EMAIL]->(e)
        )
        `,
        {
          userEmail: parsed.userEmail,
          orgId,
          deviceId: parsed.deviceId,
          hostname: parsed.details?.hostname || parsed.deviceId,
          os: parsed.details?.os || "other",
          timestamp: parsed.timestamp,
          eventId,
          eventType: parsed.eventType,
          details: parsed.details || {},
          relatedEmailMessageId: parsed.relatedEmailMessageId || null,
        }
      );
      await session.close();
    } catch (neoError) {
      console.warn("[endpoint/ingest] Neo4j write failed", neoError);
    }

    // Evaluate simple threat rules
    const ruleResult = evaluateEventForDetection({
      id: eventId,
      deviceId: parsed.deviceId,
      userEmail: parsed.userEmail,
      organizationId: orgId,
      timestamp: parsed.timestamp,
      eventType: parsed.eventType,
      details: parsed.details,
      relatedEmailMessageId: parsed.relatedEmailMessageId,
    });

    let detectionId: string | null = null;
    if (ruleResult.matched) {
      detectionId = `det-${uuid()}`;
      await ddb.send(new PutItemCommand({
        TableName: TABLES.DETECTIONS || "Detections",
        Item: {
          detectionId: { S: detectionId },
          organizationId: { S: orgId },
          emailMessageId: parsed.relatedEmailMessageId ? { S: parsed.relatedEmailMessageId } : undefined,
          severity: { S: ruleResult.severity },
          status: { S: "new" },
          name: { S: "Endpoint threat detection" },
          description: { S: ruleResult.reason },
          sentBy: { S: parsed.userEmail },
          assignedTo: { SS: [] },
          indicators: ruleResult.indicators ? { SS: ruleResult.indicators } : undefined,
          recommendations: { SS: ["Isolate device", "Collect memory dump", "Review recent emails"] },
          threatScore: { N: "80" },
          confidence: { N: "70" },
          manualFlag: { BOOL: false },
          createdAt: { S: now },
          timestamp: { S: parsed.timestamp },
        },
      }));
    }

    return NextResponse.json({
      ok: true,
      eventId,
      detectionId,
      detectionCreated: !!detectionId,
    });
  } catch (error: any) {
    console.error("[POST /api/endpoint/ingest] failed", error);
    return NextResponse.json(
      { error: "Failed to ingest endpoint event", details: error.message },
      { status: 500 }
    );
  }
}
