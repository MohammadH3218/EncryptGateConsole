"use client";

import { CopilotChat, useCopilotAction, useCopilotReadable } from "@copilotkit/react-core";
import type { CSSProperties } from "react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, AlertTriangle, Shield, Users, History, Monitor, X } from "lucide-react";
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

  const themeVars: CSSProperties = {
    // CopilotKit CSS variables – dark + SOC-ish neon accent
    "--copilot-kit-background-color": "#020617", // panel bg
    "--copilot-kit-primary-color": "#22c55e", // accent (green)
    "--copilot-kit-contrast-color": "#0b1120", // text on primary
    "--copilot-kit-input-background-color": "#020617",
    "--copilot-kit-secondary-color": "#1e293b",
    "--copilot-kit-secondary-contrast-color": "#e5e7eb",
    "--copilot-kit-separator-color": "rgba(148, 163, 184, 0.35)",
    "--copilot-kit-muted-color": "#9ca3af",
    "--copilot-kit-shadow-md":
      "0 18px 40px rgba(15, 23, 42, 0.85)", // deep SOC shadow
  };

  const quickQuestions = [
    "What URLs are in this email?",
    "Has this sender sent suspicious emails before?",
    "Analyze the recipient graph.",
    "What's unusual about this email?",
    "Is this part of a larger campaign?",
    "Show a graph of related users.",
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
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl bg-slate-950/60">
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
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-700/70 text-[10px]">
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

      {/* Tiny typing / latency hint bar (visual polish) */}
      <motion.div
        className="mt-2 flex items-center justify-between text-[10px] text-slate-500"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <span>Powered by EncryptGate Copilot</span>
        <span className="flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-emerald-400 animate-[ping_1.5s_ease-out_infinite]" />
          Streaming responses
        </span>
      </motion.div>

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

