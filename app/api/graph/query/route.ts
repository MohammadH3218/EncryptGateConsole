import { NextResponse } from "next/server";
import { z } from "zod";
import { extractOrgId } from "@/lib/aws";
import {
  getCampaignForEmail,
  getDeviceActivity,
  getHighRiskDomains,
  getSenderGraph,
  getUserEgoNetwork,
} from "@/lib/graph-service";
import {
  CampaignForEmailParams,
  DeviceActivityParams,
  HighRiskDomainParams,
  SenderGraphParams,
  UserEgoParams,
} from "./types";

export const runtime = "nodejs";

const GraphQuerySchema = z.object({
  type: z.enum([
    "sender_graph",
    "campaign_for_email",
    "user_ego",
    "device_activity",
    "high_risk_domains",
  ]),
  params: z.record(z.any()).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = GraphQuerySchema.parse(body);
    const params = parsed.params || {};
    const orgId = params.organizationId || extractOrgId(req);

    if (!orgId) {
      return NextResponse.json(
        { error: "organizationId is required" },
        { status: 401 }
      );
    }

    // Basic RBAC hook: require caller identity; fuller role validation should leverage Cognito/SessionProvider
    const actor = req.headers.get("x-user-email") || req.headers.get("authorization");
    if (!actor) {
      return NextResponse.json(
        { error: "Unauthorized: missing user context" },
        { status: 401 }
      );
    }

    switch (parsed.type) {
      case "sender_graph": {
        const parsedParams = SenderGraphParams.parse({ ...params, organizationId: orgId });
        const data = await getSenderGraph(
          parsedParams.senderEmail,
          orgId,
          parsedParams.from,
          parsedParams.to,
          parsedParams.minSeverity as any
        );
        return NextResponse.json(data);
      }
      case "campaign_for_email": {
        const parsedParams = CampaignForEmailParams.parse({ ...params, organizationId: orgId });
        const data = await getCampaignForEmail(parsedParams.emailId, orgId);
        return NextResponse.json({ data });
      }
      case "high_risk_domains": {
        const parsedParams = HighRiskDomainParams.parse({ ...params, organizationId: orgId });
        const data = await getHighRiskDomains(orgId, Number(parsedParams.limit || 10));
        return NextResponse.json({ data });
      }
      case "user_ego": {
        const parsedParams = UserEgoParams.parse({ ...params, organizationId: orgId, limit: params.limit ? Number(params.limit) : undefined });
        const data = await getUserEgoNetwork(parsedParams.userEmail, orgId, Number(parsedParams.limit || 50));
        return NextResponse.json({ ...data, summary: `User network for ${parsedParams.userEmail}` });
      }
      case "device_activity": {
        const parsedParams = DeviceActivityParams.parse({ ...params, organizationId: orgId });
        const data = await getDeviceActivity(parsedParams.deviceId, orgId, parsedParams.from, parsedParams.to);
        return NextResponse.json({ data });
      }
      default:
        return NextResponse.json({ error: "Unsupported query type" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("[POST /api/graph/query] failed", error);
    return NextResponse.json(
      { error: "Graph query failed", details: error.message },
      { status: 500 }
    );
  }
}
