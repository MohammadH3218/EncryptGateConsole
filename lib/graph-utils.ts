// lib/graph-utils.ts - Utilities for converting Neo4j results to graph format

import { GraphNode, GraphEdge, GraphData } from "@/components/graph-visualization";

/**
 * Convert Neo4j Cypher query results to graph format
 * Handles various query result formats and extracts nodes/relationships
 */
export function cypherResultsToGraph(
  results: any[],
  query?: string
): GraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();

  // Extract nodes and edges from query results
  for (const record of results) {
    // Handle different result formats
    const recordObj = typeof record === "object" ? record : {};

    // Handle path results (e.g., MATCH path = (a)-[r*]->(b) RETURN path)
    if (recordObj.path) {
      const path = recordObj.path;
      // Path can be an array of segments or a path object
      if (Array.isArray(path.segments) || Array.isArray(path)) {
        const segments = Array.isArray(path.segments) ? path.segments : path;
        for (const segment of segments) {
          // Extract start node
          if (segment.start) {
            const startNode = segment.start;
            const startId = String(
              startNode.identity ||
                startNode.properties?.email ||
                startNode.properties?.messageId ||
                startNode.properties?.url ||
                `node_${startNode.identity}`
            );
            const startLabels = startNode.labels || [];
            const startType: "User" | "Email" | "URL" =
              startLabels.includes("Email") || startNode.properties?.messageId
                ? "Email"
                : startLabels.includes("URL") || startNode.properties?.url
                  ? "URL"
                  : "User";
            if (!nodeMap.has(startId)) {
              const node: GraphNode = {
                id: startId,
                label:
                  String(
                    startNode.properties?.email ||
                      startNode.properties?.subject ||
                      startNode.properties?.url ||
                      startId
                  ).slice(0, 50),
                type: startType,
                properties: startNode.properties || {},
              };
              nodeMap.set(startId, node);
              nodes.push(node);
            }
          }

          // Extract relationship
          if (segment.relationship) {
            const rel = segment.relationship;
            const sourceId = String(
              rel.start?.identity ||
                rel.start?.properties?.email ||
                rel.start?.properties?.messageId ||
                segment.start?.identity ||
                `node_${rel.start?.identity}`
            );
            const targetId = String(
              rel.end?.identity ||
                rel.end?.properties?.email ||
                rel.end?.properties?.messageId ||
                segment.end?.identity ||
                `node_${rel.end?.identity}`
            );
            const relType = rel.type || "RELATED";
            if (sourceId && targetId && sourceId !== targetId) {
              const edgeId = `${sourceId}-${relType}-${targetId}`;
              if (!edgeMap.has(edgeId)) {
                const edge: GraphEdge = {
                  id: edgeId,
                  source: sourceId,
                  target: targetId,
                  type: relType,
                  properties: rel.properties || {},
                  timestamp: rel.properties?.sentDate || rel.properties?.timestamp,
                };
                edgeMap.set(edgeId, edge);
                edges.push(edge);
              }
            }
          }

          // Extract end node
          if (segment.end) {
            const endNode = segment.end;
            const endId = String(
              endNode.identity ||
                endNode.properties?.email ||
                endNode.properties?.messageId ||
                endNode.properties?.url ||
                `node_${endNode.identity}`
            );
            const endLabels = endNode.labels || [];
            const endType: "User" | "Email" | "URL" =
              endLabels.includes("Email") || endNode.properties?.messageId
                ? "Email"
                : endLabels.includes("URL") || endNode.properties?.url
                  ? "URL"
                  : "User";
            if (!nodeMap.has(endId)) {
              const node: GraphNode = {
                id: endId,
                label: String(
                  endNode.properties?.email ||
                    endNode.properties?.subject ||
                    endNode.properties?.url ||
                    endId
                ).slice(0, 50),
                type: endType,
                properties: endNode.properties || {},
              };
              nodeMap.set(endId, node);
              nodes.push(node);
            }
          }
        }
      }
      continue; // Skip normal processing for path results
    }

    // Check for common Neo4j result patterns
    for (const [key, value] of Object.entries(recordObj)) {
      // Handle node objects
      if (value && typeof value === "object") {
        // Check if it's a Neo4j node-like structure
        if (
          "labels" in value ||
          "identity" in value ||
          "properties" in value ||
          (Array.isArray(value.labels) && value.labels.length > 0)
        ) {
          const nodeId = String(
            value.identity || value.id || value.email || value.messageId || key
          );
          const labels = value.labels || [];
          const properties = value.properties || value;

          // Determine node type
          let nodeType: "User" | "Email" | "URL" = "User";
          if (labels.includes("Email") || properties.messageId) {
            nodeType = "Email";
          } else if (labels.includes("URL") || properties.url) {
            nodeType = "URL";
          } else if (labels.includes("User") || properties.email) {
            nodeType = "User";
          }

          const label =
            properties.email ||
            properties.subject ||
            properties.url ||
            properties.messageId ||
            nodeId;

          if (!nodeMap.has(nodeId)) {
            const node: GraphNode = {
              id: nodeId,
              label: String(label).slice(0, 50),
              type: nodeType,
              properties,
            };
            nodeMap.set(nodeId, node);
            nodes.push(node);
          }
        }

        // Check if it's a relationship-like structure
        if (
          "type" in value ||
          "start" in value ||
          "end" in value ||
          "relationship" in value
        ) {
          const rel = value;
          const sourceId = String(
            rel.start?.identity ||
              rel.start?.email ||
              rel.start?.messageId ||
              rel.source ||
              key
          );
          const targetId = String(
            rel.end?.identity ||
              rel.end?.email ||
              rel.end?.messageId ||
              rel.target ||
              key
          );
          const relType = rel.type || rel.relationship || "RELATED";
          const properties = rel.properties || {};

          if (sourceId && targetId && sourceId !== targetId) {
            const edgeId = `${sourceId}-${relType}-${targetId}`;
            if (!edgeMap.has(edgeId)) {
              const edge: GraphEdge = {
                id: edgeId,
                source: sourceId,
                target: targetId,
                type: relType,
                properties,
                timestamp: properties.sentDate || properties.timestamp,
              };
              edgeMap.set(edgeId, edge);
              edges.push(edge);
            }
          }
        }
      }

      // Handle arrays (e.g., collect() results)
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object") {
            // Recursively process array items
            const subGraph = cypherResultsToGraph([item]);
            subGraph.nodes.forEach((n) => {
              if (!nodeMap.has(n.id)) {
                nodeMap.set(n.id, n);
                nodes.push(n);
              }
            });
            subGraph.edges.forEach((e) => {
              if (!edgeMap.has(e.id)) {
                edgeMap.set(e.id, e);
                edges.push(e);
              }
            });
          }
        }
      }
    }

    // Try to infer relationships from query results
    // Look for patterns like sender, recipient, email relationships
    if (recordObj.sender && recordObj.recipient) {
      const senderId = String(recordObj.sender.email || recordObj.sender);
      const recipientId = String(recordObj.recipient.email || recordObj.recipient);
      
      if (senderId && recipientId && senderId !== recipientId) {
        const edgeId = `${senderId}-WAS_SENT_TO-${recipientId}`;
        if (!edgeMap.has(edgeId)) {
          // Ensure nodes exist
          if (!nodeMap.has(senderId)) {
            const senderNode: GraphNode = {
              id: senderId,
              label: String(recordObj.sender.email || senderId).slice(0, 50),
              type: "User",
              properties: typeof recordObj.sender === "object" ? recordObj.sender : {},
            };
            nodeMap.set(senderId, senderNode);
            nodes.push(senderNode);
          }
          
          if (!nodeMap.has(recipientId)) {
            const recipientNode: GraphNode = {
              id: recipientId,
              label: String(recordObj.recipient.email || recipientId).slice(0, 50),
              type: "User",
              properties: typeof recordObj.recipient === "object" ? recordObj.recipient : {},
            };
            nodeMap.set(recipientId, recipientNode);
            nodes.push(recipientNode);
          }

          const edge: GraphEdge = {
            id: edgeId,
            source: senderId,
            target: recipientId,
            type: "WAS_SENT_TO",
            properties: {},
            timestamp: recordObj.sentDate || recordObj.timestamp,
          };
          edgeMap.set(edgeId, edge);
          edges.push(edge);
        }
      }
    }

    // Handle email relationships
    if (recordObj.email && recordObj.user) {
      const emailId = String(recordObj.email.messageId || recordObj.email);
      const userId = String(recordObj.user.email || recordObj.user);

      if (emailId && userId) {
        // Ensure nodes exist
        if (!nodeMap.has(emailId)) {
          const emailNode: GraphNode = {
            id: emailId,
            label: String(recordObj.email.subject || emailId).slice(0, 50),
            type: "Email",
            properties: typeof recordObj.email === "object" ? recordObj.email : {},
          };
          nodeMap.set(emailId, emailNode);
          nodes.push(emailNode);
        }

        if (!nodeMap.has(userId)) {
          const userNode: GraphNode = {
            id: userId,
            label: String(recordObj.user.email || userId).slice(0, 50),
            type: "User",
            properties: typeof recordObj.user === "object" ? recordObj.user : {},
          };
          nodeMap.set(userId, userNode);
          nodes.push(userNode);
        }

        // Determine relationship direction
        const edgeType = recordObj.relationship || "WAS_SENT";
        const edgeId = `${userId}-${edgeType}-${emailId}`;
        
        if (!edgeMap.has(edgeId)) {
          const edge: GraphEdge = {
            id: edgeId,
            source: userId,
            target: emailId,
            type: edgeType,
            properties: {},
            timestamp: recordObj.sentDate || recordObj.timestamp,
          };
          edgeMap.set(edgeId, edge);
          edges.push(edge);
        }
      }
    }
  }

  return { nodes, edges };
}

/**
 * Extract graph data from agent tool results
 * Looks for Cypher query results in the tool results
 */
export function extractGraphFromToolResults(
  toolResults: Array<{
    toolName: string;
    result: any;
    success: boolean;
  }>
): GraphData | null {
  const allNodes: GraphNode[] = [];
  const allEdges: GraphEdge[] = [];
  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();

  for (const toolResult of toolResults) {
    if (toolResult.toolName === "run_cypher" && toolResult.success) {
      const result = toolResult.result;
      
      if (result?.data && Array.isArray(result.data)) {
        const graph = cypherResultsToGraph(result.data, result.query);
        
        // Merge nodes
        graph.nodes.forEach((node) => {
          if (!nodeMap.has(node.id)) {
            nodeMap.set(node.id, node);
            allNodes.push(node);
          }
        });

        // Merge edges
        graph.edges.forEach((edge) => {
          if (!edgeMap.has(edge.id)) {
            edgeMap.set(edge.id, edge);
            allEdges.push(edge);
          }
        });
      }
    }
  }

  if (allNodes.length === 0) {
    return null;
  }

  return { nodes: allNodes, edges: allEdges };
}

/**
 * Check if a message contains graph-worthy data
 */
export function shouldShowGraph(message: {
  thinking?: {
    toolResults?: Array<{
      toolName: string;
      result: any;
      success: boolean;
    }>;
  };
}): boolean {
  if (!message.thinking?.toolResults) return false;

  return message.thinking.toolResults.some(
    (tr) =>
      tr.toolName === "run_cypher" &&
      tr.success &&
      tr.result?.data &&
      Array.isArray(tr.result.data) &&
      tr.result.data.length > 0
  );
}

