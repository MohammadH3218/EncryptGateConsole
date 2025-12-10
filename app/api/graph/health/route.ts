import { NextResponse } from "next/server";
import { ensureNeo4jConnection } from "@/lib/neo4j";

export const runtime = "nodejs";

export async function GET() {
  try {
    const neo4j = await ensureNeo4jConnection();
    await neo4j.runQuery("RETURN 1 as ok");
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[GET /api/graph/health] Neo4j health failed", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Graph health check failed" },
      { status: 500 }
    );
  }
}
