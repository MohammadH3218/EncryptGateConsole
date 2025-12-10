import { ensureNeo4jConnection } from "./neo4j";
import {
  GraphLink,
  GraphNode,
  Severity,
} from "@/types/domain";

type NullableDate = string | undefined;

// Graph schema assumptions (documented for Copilot + future devs):
// Nodes:
//   (:User {email, name?, orgId})
//   (:Domain {name, orgId})
//   (:Email {id, messageId, subject, sentAt, severity, riskScore, orgId})
//   (:Attachment {id, filename, mimeType, verdict})
//   (:URL {id, value, risk})
//   (:Incident {id, type, createdAt, severity})
//   (:Device {id, deviceId, hostname, userEmail, os, lastSeen, riskScore, orgId})
//   (:EndpointEvent {id, eventType, timestamp, orgId, ...})
// Relationships:
//   (User)-[:SENT|WAS_SENT]->(Email)
//   (Email)-[:TO|WAS_SENT_TO]->(User)
//   (Email)-[:FROM_DOMAIN]->(Domain)
//   (Email)-[:HAS_ATTACHMENT]->(Attachment)
//   (Email)-[:HAS_URL|CONTAINS_URL]->(URL)
//   (Email)-[:PART_OF_CAMPAIGN]->(Incident)
//   (User)-[:USES_DEVICE]->(Device)
//   (Device)-[:HAS_EVENT]->(EndpointEvent)
//   (EndpointEvent)-[:RELATED_TO_EMAIL]->(Email)

function toDateFilter(field: string, from?: NullableDate, to?: NullableDate) {
  if (!from && !to) return "";
  const filters: string[] = [];
  if (from) filters.push(`${field} >= datetime($from)`);
  if (to) filters.push(`${field} <= datetime($to)`);
  return filters.length ? `AND ${filters.join(" AND ")}` : "";
}

function upsertNode(nodes: Map<string, GraphNode>, node: GraphNode) {
  if (!nodes.has(node.id)) {
    nodes.set(node.id, node);
  }
}

function pushLink(
  links: GraphLink[],
  source: string,
  target: string,
  type: string,
  properties?: Record<string, any>
) {
  links.push({ source, target, type, properties });
}

export async function getSenderGraph(
  senderEmail: string,
  orgId: string,
  from?: NullableDate,
  to?: NullableDate,
  minSeverity?: Severity
): Promise<{ nodes: GraphNode[]; links: GraphLink[]; summary: string }> {
  const neo4j = await ensureNeo4jConnection();
  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];

  const severityRank: Record<Severity, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };

  const severityFilter = minSeverity
    ? `AND coalesce(CASE e.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END, 0) >= ${severityRank[minSeverity]}`
    : "";

  const dateFilter = toDateFilter("coalesce(e.sentAt, e.sentDate, e.timestamp)", from, to);

  const query = `
    MATCH (sender:User {email:$senderEmail, orgId:$orgId})-[:WAS_SENT|:SENT]->(e:Email {orgId:$orgId})
    WHERE 1=1 ${severityFilter} ${dateFilter}
    OPTIONAL MATCH (e)-[:WAS_SENT_TO|:TO]->(r:User {orgId:$orgId})
    OPTIONAL MATCH (e)-[:PART_OF_CAMPAIGN]->(inc:Incident)
    RETURN sender, e, collect(DISTINCT r) AS recipients, collect(DISTINCT inc) AS incidents
    LIMIT 200
  `;

  const results = await neo4j.runQuery(query, {
    senderEmail,
    orgId,
    from,
    to,
  });

  for (const row of results) {
    const sender = row.sender;
    const email = row.e;
    const recipients = row.recipients || [];
    const incidents = row.incidents || [];

    if (sender?.email) {
      upsertNode(nodes, {
        id: `user:${sender.email}`,
        label: sender.email,
        type: "user",
        properties: { orgId: sender.orgId },
      });
    }

    if (email?.messageId) {
      upsertNode(nodes, {
        id: `email:${email.messageId}`,
        label: email.subject || email.messageId,
        type: "email",
        properties: {
          subject: email.subject,
          severity: email.severity,
          sentAt: email.sentAt || email.sentDate || email.timestamp,
        },
      });
      if (sender?.email) {
        pushLink(links, `user:${sender.email}`, `email:${email.messageId}`, "SENT");
      }
    }

    for (const recipient of recipients) {
      if (!recipient?.email) continue;
      upsertNode(nodes, {
        id: `user:${recipient.email}`,
        label: recipient.email,
        type: "user",
        properties: { orgId: recipient.orgId },
      });
      if (email?.messageId) {
        pushLink(links, `email:${email.messageId}`, `user:${recipient.email}`, "TO");
      }
    }

    for (const inc of incidents) {
      if (!inc?.id && !inc?.incidentId) continue;
      const incId = inc.id || inc.incidentId;
      upsertNode(nodes, {
        id: `incident:${incId}`,
        label: inc.type || "Campaign",
        type: "incident",
        properties: {
          severity: inc.severity,
          createdAt: inc.createdAt,
        },
      });
      if (email?.messageId) {
        pushLink(links, `email:${email.messageId}`, `incident:${incId}`, "PART_OF_CAMPAIGN");
      }
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    links,
    summary: results.length
      ? `Found ${results.length} emails from ${senderEmail}`
      : `No graph data for ${senderEmail}`,
  };
}

export async function getCampaignForEmail(emailId: string, orgId: string) {
  const neo4j = await ensureNeo4jConnection();
  const query = `
    MATCH (e:Email {messageId:$emailId, orgId:$orgId})-[:PART_OF_CAMPAIGN]->(inc:Incident)
    OPTIONAL MATCH (inc)<-[:PART_OF_CAMPAIGN]-(related:Email {orgId:$orgId})
    OPTIONAL MATCH (related)<-[:WAS_SENT|:SENT]-(sender:User {orgId:$orgId})
    RETURN inc, collect(DISTINCT related) AS relatedEmails, collect(DISTINCT sender) AS senders
    LIMIT 50
  `;

  const res = await neo4j.runQuery(query, { emailId, orgId });
  if (!res.length) {
    return { incident: null, emails: [], senders: [] };
  }
  const row = res[0];
  return {
    incident: row.inc || null,
    emails: row.relatedEmails || [],
    senders: row.senders || [],
  };
}

export async function getHighRiskDomains(orgId: string, limit = 10) {
  const neo4j = await ensureNeo4jConnection();
  const query = `
    MATCH (d:Domain {orgId:$orgId})<-[:FROM_DOMAIN]-(e:Email {orgId:$orgId})
    WITH d, count(e) AS emailCount, sum(CASE WHEN e.severity IN ['high','critical'] THEN 1 ELSE 0 END) AS riskyCount
    RETURN d.name AS domain, emailCount, riskyCount
    ORDER BY riskyCount DESC, emailCount DESC
    LIMIT $limit
  `;
  const res = await neo4j.runQuery(query, { orgId, limit });
  return res.map((row) => ({
    domain: row.domain,
    count: row.emailCount,
    riskyCount: row.riskyCount,
  }));
}

export async function getUserEgoNetwork(
  userEmail: string,
  orgId: string,
  limit = 50
): Promise<{ nodes: GraphNode[]; links: GraphLink[] }> {
  const neo4j = await ensureNeo4jConnection();
  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];

  const query = `
    MATCH (u:User {email:$userEmail, orgId:$orgId})
    OPTIONAL MATCH (u)-[:WAS_SENT|:SENT]->(e:Email {orgId:$orgId})-[:WAS_SENT_TO|:TO]->(r:User {orgId:$orgId})
    OPTIONAL MATCH (u)-[:USES_DEVICE]->(d:Device {orgId:$orgId})
    RETURN u, collect(DISTINCT e)[0..$limit] AS emails, collect(DISTINCT r)[0..$limit] AS recipients, collect(DISTINCT d)[0..$limit] AS devices
  `;

  const res = await neo4j.runQuery(query, { userEmail, orgId, limit });
  if (!res.length) {
    return { nodes: [], links: [] };
  }
  const row = res[0];
  const user = row.u;
  if (user?.email) {
    upsertNode(nodes, {
      id: `user:${user.email}`,
      label: user.email,
      type: "user",
      properties: { orgId: user.orgId },
    });
  }

  for (const email of row.emails || []) {
    if (!email?.messageId) continue;
    upsertNode(nodes, {
      id: `email:${email.messageId}`,
      label: email.subject || email.messageId,
      type: "email",
      properties: {
        severity: email.severity,
        sentAt: email.sentAt || email.sentDate || email.timestamp,
      },
    });
    if (user?.email) {
      pushLink(links, `user:${user.email}`, `email:${email.messageId}`, "SENT");
    }
  }

  for (const recipient of row.recipients || []) {
    if (!recipient?.email) continue;
    upsertNode(nodes, {
      id: `user:${recipient.email}`,
      label: recipient.email,
      type: "user",
      properties: { orgId: recipient.orgId },
    });
    for (const email of row.emails || []) {
      if (email?.messageId) {
        pushLink(links, `email:${email.messageId}`, `user:${recipient.email}`, "TO");
      }
    }
  }

  for (const device of row.devices || []) {
    if (!device?.deviceId) continue;
    upsertNode(nodes, {
      id: `device:${device.deviceId}`,
      label: device.hostname || device.deviceId,
      type: "device",
      properties: {
        os: device.os,
        lastSeen: device.lastSeen,
        riskScore: device.riskScore,
      },
    });
    if (user?.email) {
      pushLink(links, `user:${user.email}`, `device:${device.deviceId}`, "USES_DEVICE");
    }
  }

  return { nodes: Array.from(nodes.values()), links };
}

export async function getDeviceActivity(
  deviceId: string,
  orgId: string,
  from?: NullableDate,
  to?: NullableDate
): Promise<{ device: any; events: any[]; relatedEmails: any[] }> {
  const neo4j = await ensureNeo4jConnection();
  const dateFilter = toDateFilter("evt.timestamp", from, to);
  const query = `
    MATCH (d:Device {deviceId:$deviceId, orgId:$orgId})
    OPTIONAL MATCH (d)-[:HAS_EVENT]->(evt:EndpointEvent)
    WHERE 1=1 ${dateFilter}
    OPTIONAL MATCH (evt)-[:RELATED_TO_EMAIL]->(em:Email {orgId:$orgId})
    RETURN d AS device, collect(DISTINCT evt) AS events, collect(DISTINCT em) AS emails
    LIMIT 200
  `;
  const res = await neo4j.runQuery(query, { deviceId, orgId, from, to });
  if (!res.length) {
    return { device: null, events: [], relatedEmails: [] };
  }
  const row = res[0];
  return {
    device: row.device || null,
    events: row.events || [],
    relatedEmails: row.emails || [],
  };
}
