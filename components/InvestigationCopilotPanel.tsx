"use client";

import { CopilotChat } from "@copilotkit/react-ui";
import { useCopilotAction, useCopilotReadable } from "@copilotkit/react-core";
import type { CSSProperties } from "react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, AlertTriangle, Shield, Users, History, Monitor, X, Loader2 } from "lucide-react";
import { EmailRelationshipGraph } from "@/components/EmailRelationshipGraph";

interface InvestigationCopilotPanelProps {
  investigationId: string;
  emailId?: string | null;
}

export function InvestigationCopilotPanel({
  investigationId,
  emailId,
}: InvestigationCopilotPanelProps) {
  const [selectedGraphSender, setSelectedGraphSender] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Track loading state by monitoring CopilotKit chat for streaming indicators
  useEffect(() => {
    const chatContainer = document.querySelector('[class*="copilot-chat"]');
    if (!chatContainer) return;
    
    const checkForLoading = () => {
      // Check for typing indicators, streaming text, or loading states
      const hasStreaming = chatContainer.querySelector('[class*="streaming"], [class*="typing"]');
      const lastMessage = chatContainer.querySelector('[class*="message"]:last-child');
      const hasEmptyResponse = lastMessage && (!lastMessage.textContent || lastMessage.textContent.trim().length === 0);
      
      setIsLoading(!!hasStreaming || (!!hasEmptyResponse && lastMessage?.querySelector('[class*="assistant"]')));
    };
    
    // Check periodically
    const interval = setInterval(checkForLoading, 200);
    
    // Watch for DOM changes
    const observer = new MutationObserver(() => {
      checkForLoading();
    });
    
    observer.observe(chatContainer, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    
    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, []);

  // Provide context to CopilotKit about the current investigation
  useCopilotReadable({
    description: "Current investigation context",
    value: {
      investigationId,
      emailId: emailId || null,
    },
  });

  // CopilotKit action to show email relationship graph
  useCopilotAction({
    name: "showEmailRelationshipGraph",
    description: "Visualize relationships between a sender and recipients. Use this when the user asks about sender patterns, recipient networks, or email relationships.",
    parameters: [
      {
        name: "senderEmail",
        type: "string",
        description: "The email address of the sender to visualize relationships for",
        required: true,
      },
    ],
    handler: async ({ senderEmail }) => {
      if (senderEmail) {
        setSelectedGraphSender(senderEmail);
      }
    },
  });

  // CopilotKit action: Get detection summary
  useCopilotAction({
    name: "getDetectionSummary",
    description: "Fetch detailed information about a security detection including severity, indicators, similar incidents, and recommended actions. Use this when the user asks about detection details or wants to understand why something was flagged.",
    parameters: [
      {
        name: "detectionId",
        type: "string",
        description: "The ID of the detection to get details for",
        required: true,
      },
    ],
    handler: async ({ detectionId }) => {
      try {
        const response = await fetch(`/api/detections/${encodeURIComponent(detectionId)}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch detection: ${response.statusText}`);
        }
        const detection = await response.json();
        return {
          success: true,
          detection: {
            id: detection.id,
            name: detection.name,
            severity: detection.severity,
            status: detection.status,
            indicators: detection.indicators || [],
            recommendations: detection.recommendations || [],
            threatScore: detection.threatScore,
            confidence: detection.confidence,
            sentBy: detection.sentBy,
            description: detection.description,
          },
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || "Failed to fetch detection summary",
        };
      }
    },
  });

  // CopilotKit action: Query email graph
  useCopilotAction({
    name: "queryEmailGraph",
    description: "Query the Neo4j email relationship graph to find sender patterns, recipient networks, or campaign relationships. Use this when the user asks about email relationships, sender history, or campaign analysis.",
    parameters: [
      {
        name: "senderEmail",
        type: "string",
        description: "The email address of the sender to query",
        required: false,
      },
      {
        name: "timeRange",
        type: "string",
        description: "Time range for the query (e.g., '7d', '30d', '90d')",
        required: false,
      },
      {
        name: "minSeverity",
        type: "string",
        description: "Minimum severity level to filter by (low, medium, high, critical)",
        required: false,
      },
    ],
    handler: async ({ senderEmail, timeRange, minSeverity }) => {
      try {
        const response = await fetch("/api/graph/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "sender_graph",
            params: {
              senderEmail: senderEmail || emailId || "",
              minSeverity: minSeverity || undefined,
            },
          }),
        });
        if (!response.ok) {
          throw new Error(`Failed to query graph: ${response.statusText}`);
        }
        const result = await response.json();
        return {
          success: true,
          graph: result.graph || result,
          summary: result.summary || "Graph query completed successfully",
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || "Failed to query email graph",
        };
      }
    },
  });

  // CopilotKit action: List similar incidents
  useCopilotAction({
    name: "listSimilarIncidents",
    description: "Find emails or incidents that share characteristics with the current investigation (same sender, domain, URLs, or similar patterns). Use this when the user asks about similar emails, campaigns, or related threats.",
    parameters: [
      {
        name: "emailId",
        type: "string",
        description: "The email ID or message ID to find similar incidents for",
        required: false,
      },
    ],
    handler: async ({ emailId: providedEmailId }) => {
      try {
        const targetEmailId = providedEmailId || emailId;
        if (!targetEmailId) {
          return {
            success: false,
            error: "Email ID is required to find similar incidents",
          };
        }

        // Query graph for similar incidents
        const response = await fetch("/api/graph/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "campaign_for_email",
            params: { emailId: targetEmailId },
          }),
        });
        if (!response.ok) {
          throw new Error(`Failed to find similar incidents: ${response.statusText}`);
        }
        const result = await response.json();
        return {
          success: true,
          similarIncidents: result.incidents || result.data || [],
          count: result.count || 0,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || "Failed to find similar incidents",
        };
      }
    },
  });

  // CopilotKit action: Update detection status (with confirmation)
  useCopilotAction({
    name: "updateDetectionStatus",
    description: "Update the status of a security detection (e.g., mark as in_progress, resolved, or false_positive). IMPORTANT: Always ask the user for confirmation before calling this action, as it changes the state of an investigation.",
    parameters: [
      {
        name: "detectionId",
        type: "string",
        description: "The ID of the detection to update",
        required: true,
      },
      {
        name: "newStatus",
        type: "string",
        description: "The new status (new, in_progress, resolved, false_positive)",
        required: true,
      },
      {
        name: "confirmed",
        type: "boolean",
        description: "Confirmation flag - must be true to proceed",
        required: true,
      },
    ],
    handler: async ({ detectionId, newStatus, confirmed }) => {
      if (!confirmed) {
        return {
          success: false,
          error: "Confirmation required. Please confirm that you want to update the detection status.",
          requiresConfirmation: true,
        };
      }

      try {
        const response = await fetch(`/api/detections/${encodeURIComponent(detectionId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!response.ok) {
          throw new Error(`Failed to update detection status: ${response.statusText}`);
        }
        const result = await response.json();
        return {
          success: true,
          message: `Detection status updated to ${newStatus}`,
          detection: result,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || "Failed to update detection status",
        };
      }
    },
  });

  const themeVars: CSSProperties = {
    // CopilotKit CSS variables – dark theme with blacks, greys
    "--copilot-kit-background-color": "#0f172a", // slate-900
    "--copilot-kit-primary-color": "#22c55e", // emerald-500 (green accent)
    "--copilot-kit-contrast-color": "#020617", // slate-950
    "--copilot-kit-input-background-color": "#020617", // slate-950
    "--copilot-kit-secondary-color": "#1e293b", // slate-800
    "--copilot-kit-secondary-contrast-color": "#f1f5f9", // slate-100
    "--copilot-kit-separator-color": "rgba(148, 163, 184, 0.2)", // slate-400/20
    "--copilot-kit-muted-color": "#64748b", // slate-500
    "--copilot-kit-text-color": "#e2e8f0", // slate-200
    "--copilot-kit-text-secondary-color": "#94a3b8", // slate-400
    "--copilot-kit-shadow-md": "0 18px 40px rgba(15, 23, 42, 0.85)",
  };

  const quickQuestions = [
    "What URLs are in this email?",
    "Has this sender sent suspicious emails before?",
    "Analyze the recipient graph.",
    "What's unusual about this email?",
    "Is this part of a larger campaign?",
    "Show a graph of related users.",
    "Show recent suspicious activity on this user's devices.",
    "List similar incidents tied to this email.",
  ];

  return (
    <motion.aside
      className="flex h-full flex-col rounded-2xl border border-slate-800/80 bg-slate-900/60 p-3 shadow-2xl backdrop-blur-xl"
      style={themeVars}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-800/70 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/40">
            <Monitor className="h-4 w-4 text-emerald-300" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight text-slate-50">
              Investigation Assistant
            </p>
            <p className="text-[11px] text-slate-400">
              Ask about relationships, risk, and similar incidents.
            </p>
          </div>
        </div>

        {/* Status pill */}
        <motion.span
          className="inline-flex items-center gap-1 rounded-full bg-slate-800/80 px-2.5 py-1 text-[10px] font-medium text-slate-300"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25 }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Ready
        </motion.span>
      </div>

      {/* Quick Actions Row */}
      <div className="mb-2 flex flex-wrap gap-1.5 border-b border-slate-800/70 pb-2">
        {[
          { icon: Sparkles, label: "Initialize", id: "initialize" },
          { icon: AlertTriangle, label: "Why Flagged?", id: "whyFlagged" },
          { icon: Users, label: "Who Else?", id: "whoElse" },
          { icon: Shield, label: "Sender Risk", id: "senderRisk" },
          { icon: History, label: "Similar Incidents", id: "similarIncidents" },
        ].map((action) => {
          const Icon = action.icon;
          return (
            <motion.button
              key={action.id}
              className="rounded-lg border border-slate-700/70 bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-300 transition-all duration-200 hover:border-emerald-500/80 hover:bg-slate-900 hover:text-emerald-200"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                const input = document.querySelector<HTMLTextAreaElement>(
                  "[data-copilot-chat-input]"
                );
                if (input) {
                  input.value = action.label;
                  input.focus();
                }
              }}
            >
              <Icon className="inline h-3 w-3 mr-1" />
              {action.label}
            </motion.button>
          );
        })}
      </div>

      {/* Suggested quick questions */}
      <motion.div
        className="mb-3 flex flex-wrap gap-1.5"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0, y: 10 },
          visible: {
            opacity: 1,
            y: 0,
            transition: { delay: 0.15, staggerChildren: 0.03 },
          },
        }}
      >
        {quickQuestions.map((q) => (
          <motion.button
            key={q}
            className="group rounded-full border border-slate-700/70 bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-300 transition-all duration-200 hover:border-emerald-500/80 hover:bg-slate-900 hover:text-emerald-200"
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              const input = document.querySelector<HTMLTextAreaElement>(
                "[data-copilot-chat-input]"
              );
              if (input) {
                input.value = q;
                input.focus();
              }
            }}
          >
            {q}
          </motion.button>
        ))}
      </motion.div>

      {/* Chat area */}
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl bg-slate-950/60 relative">
        <CopilotChat
          className="w-full"
          // Let CopilotKit know about current context
          metadata={{
            investigationId,
            emailId: emailId ?? undefined,
          }}
          labels={{
            inputPlaceholder: "Ask about this email, sender, or campaign…",
            title: "",
          }}
          showHeader={false}
          // optional: avatar icons
          icons={{
            user: (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-700/70 text-[10px] text-slate-200">
                U
              </div>
            ),
            assistant: (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] text-emerald-300">
                AI
              </div>
            ),
          }}
        />
      </div>

      {/* Loading indicator */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            className="mt-2 flex items-center justify-end text-[10px] text-slate-400"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2 }}
          >
            <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/50 border border-slate-700/50">
              <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
              <span className="text-slate-400">Processing...</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Graph Visualization Section */}
      <AnimatePresence>
        {selectedGraphSender && (
          <motion.div
            className="mt-3 rounded-xl border border-slate-800 bg-slate-950/80 p-3"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-300">
                Relationship Graph: {selectedGraphSender}
              </p>
              <button
                onClick={() => setSelectedGraphSender(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <EmailRelationshipGraph
              senderEmail={selectedGraphSender}
              onNodeClick={(node) => {
                // Handle node click if needed
                console.log("Graph node clicked:", node);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}

