"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";

const ForceGraph2D = dynamic(
  () => import("react-force-graph").then((mod) => mod.ForceGraph2D),
  { ssr: false }
);

interface GraphData {
  nodes: any[];
  links: any[];
}

interface EmailRelationshipGraphProps {
  senderEmail: string;
  onNodeClick?: (node: any) => void;
}

export function EmailRelationshipGraph({
  senderEmail,
  onNodeClick,
}: EmailRelationshipGraphProps) {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!senderEmail) return;

    setLoading(true);
    setError(null);

    fetch("/api/neo4j/relationships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderEmail }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json();
          throw new Error(err.error || "Failed to load graph data");
        }
        return r.json();
      })
      .then((graphData) => {
        setData(graphData);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load graph:", err);
        setError(err.message);
        setLoading(false);
      });
  }, [senderEmail]);

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/80">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mx-auto mb-2" />
          <p className="text-xs text-slate-400">Loading relationship graph…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/80">
        <div className="text-center max-w-xs">
          <p className="text-sm text-red-400 mb-1">Error loading graph</p>
          <p className="text-xs text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/80">
        <p className="text-xs text-slate-400">No relationships found</p>
      </div>
    );
  }

  return (
    <motion.div
      className="h-72 w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <ForceGraph2D
        graphData={data}
        nodeLabel={(n: any) => {
          if (n.labels?.includes("User")) {
            return n.email || n.id;
          }
          return n.subject || n.messageId || n.id;
        }}
        nodeRelSize={6}
        linkColor={() => "rgba(148, 163, 184, 0.6)"}
        nodeColor={(n: any) => {
          if (n.labels?.includes("User")) {
            return n.email === senderEmail
              ? "#22c55e" // emerald for sender
              : "#3b82f6"; // blue for recipients
          }
          return "#8b5cf6"; // purple for emails
        }}
        onNodeClick={(node: any) => {
          onNodeClick?.(node);
        }}
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D) => {
          const label =
            node.labels?.includes("User")
              ? node.email || node.id
              : (node.subject || node.messageId || node.id)?.slice(0, 20);
          const fontSize = 10;
          ctx.font = `${fontSize}px Sans-Serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = node.labels?.includes("User")
            ? node.email === senderEmail
              ? "#22c55e"
              : "#3b82f6"
            : "#8b5cf6";
          ctx.fillText(label, node.x || 0, (node.y || 0) + 8);
        }}
      />
    </motion.div>
  );
}

