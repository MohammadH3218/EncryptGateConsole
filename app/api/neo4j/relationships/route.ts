import { NextRequest, NextResponse } from "next/server";
import { getDriver } from "@/lib/neo4j";
import neo4j from "neo4j-driver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { senderEmail } = await req.json();

    if (!senderEmail) {
      return NextResponse.json(
        { error: "senderEmail is required" },
        { status: 400 }
      );
    }

    const driver = await getDriver();
    const session = driver.session();

    try {
      const result = await session.run(
        `
        MATCH (s:User {email: $senderEmail})-[:WAS_SENT]->(e:Email)-[:WAS_SENT_TO]->(r:User)
        RETURN s, e, r
        ORDER BY e.sentDate DESC
        LIMIT 200
        `,
        { senderEmail }
      );

      const nodesMap = new Map<string, any>();
      const links: any[] = [];

      for (const record of result.records) {
        const s = record.get("s");
        const e = record.get("e");
        const r = record.get("r");

        const addNode = (n: any, label: string) => {
          const id = n.elementId || `${label}-${JSON.stringify(n.properties)}`;
          if (!nodesMap.has(id)) {
            const nodeData: any = {
              id,
              labels: n.labels || [label],
            };

            // Extract properties
            for (const [key, value] of Object.entries(n.properties || {})) {
              if (value && typeof value === "object" && "low" in value) {
                // Neo4j Integer type
                nodeData[key] = neo4j.integer.toNumber(value);
              } else {
                nodeData[key] = value;
              }
            }

            nodesMap.set(id, nodeData);
          }
          return id;
        };

        const senderId = addNode(s, "User");
        const emailId = addNode(e, "Email");
        const recipientId = addNode(r, "User");

        // Add SENT relationship
        links.push({
          source: senderId,
          target: emailId,
          type: "WAS_SENT",
        });

        // Add TO relationship
        links.push({
          source: emailId,
          target: recipientId,
          type: "WAS_SENT_TO",
        });
      }

      return NextResponse.json({
        nodes: Array.from(nodesMap.values()),
        links,
      });
    } finally {
      await session.close();
    }
  } catch (error: any) {
    console.error("Neo4j relationship query error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to query relationships" },
      { status: 500 }
    );
  }
}

