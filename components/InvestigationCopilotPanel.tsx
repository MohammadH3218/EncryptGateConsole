"use client";

import { CopilotChat } from "@copilotkit/react-ui";
import { useCopilotAction, useCopilotReadable } from "@copilotkit/react-core";
import type { CSSProperties } from "react";
import { useState, useEffect } from "react";
import { Sparkles, AlertTriangle, Shield, Users, History, Loader2 } from "lucide-react";

interface InvestigationCopilotPanelProps {
  investigationId: string;
  emailId?: string | null;
}

export function InvestigationCopilotPanel({
  investigationId,
  emailId,
}: InvestigationCopilotPanelProps) {
  const [isLoading, setIsLoading] = useState(false);

  // Provide context to CopilotKit
  useCopilotReadable({
    description: "Current investigation context",
    value: {
      investigationId,
      emailId: emailId || null,
    },
  });

  // CopilotKit actions
  useCopilotAction({
    name: "getDetectionSummary",
    description: "Fetch detailed information about a security detection",
    parameters: [
      {
        name: "detectionId",
        type: "string",
        description: "The ID of the detection",
        required: true,
      },
    ],
    handler: async ({ detectionId }) => {
      try {
        const response = await fetch(`/api/detections/${encodeURIComponent(detectionId)}`);
        if (!response.ok) throw new Error(`Failed to fetch detection`);
        const detection = await response.json();
        return {
          success: true,
          detection,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  });

  useCopilotAction({
    name: "listSimilarIncidents",
    description: "Find similar incidents or emails",
    parameters: [
      {
        name: "emailId",
        type: "string",
        description: "Email ID to find similar incidents for",
        required: false,
      },
    ],
    handler: async ({ emailId: providedEmailId }) => {
      try {
        const targetEmailId = providedEmailId || emailId;
        if (!targetEmailId) {
          return { success: false, error: "Email ID required" };
        }

        const response = await fetch("/api/graph/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "campaign_for_email",
            params: { emailId: targetEmailId },
          }),
        });

        if (!response.ok) throw new Error("Failed to find similar incidents");
        const result = await response.json();
        return {
          success: true,
          similarIncidents: result.incidents || [],
          count: result.count || 0,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  });

  const themeVars: CSSProperties = {
    "--copilot-kit-background-color": "#020617",
    "--copilot-kit-primary-color": "#10b981",
    "--copilot-kit-contrast-color": "#000000",
    "--copilot-kit-input-background-color": "#000000",
    "--copilot-kit-secondary-color": "#0f172a",
    "--copilot-kit-secondary-contrast-color": "#f1f5f9",
    "--copilot-kit-separator-color": "rgba(100, 116, 139, 0.2)",
    "--copilot-kit-muted-color": "#64748b",
    "--copilot-kit-text-color": "#e2e8f0",
    "--copilot-kit-text-secondary-color": "#94a3b8",
    "--copilot-kit-shadow-md": "none",
  };

  const quickActions = [
    { icon: Sparkles, label: "Initialize", id: "initialize" },
    { icon: AlertTriangle, label: "Why Flagged?", id: "whyFlagged" },
    { icon: Users, label: "Who Else?", id: "whoElse" },
    { icon: Shield, label: "Sender Risk", id: "senderRisk" },
    { icon: History, label: "Similar Incidents", id: "similarIncidents" },
  ];

  const quickQuestions = [
    "What URLs are in this email?",
    "Has this sender sent suspicious emails before?",
    "Analyze the recipient graph.",
    "What's unusual about this email?",
    "Is this part of a larger campaign?",
  ];

  return (
    <div className="h-full flex flex-col" style={themeVars}>
      {/* Header */}
      <div className="border-b border-slate-800 px-4 py-3 bg-slate-950">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-white">Investigation Assistant</h2>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-slate-400">Ready</span>
          </div>
        </div>
        <p className="text-xs text-slate-500">Ask about relationships, risk, and similar incidents</p>
      </div>

      {/* Quick Actions */}
      <div className="border-b border-slate-800 px-4 py-3 bg-slate-950">
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded transition-colors"
                onClick={() => {
                  const input = document.querySelector<HTMLTextAreaElement>("[data-copilot-chat-input]");
                  if (input) {
                    input.value = action.label;
                    input.focus();
                  }
                }}
              >
                <Icon className="h-3 w-3" />
                {action.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Suggested Questions */}
      <div className="border-b border-slate-800 px-4 py-3 bg-slate-950">
        <div className="flex flex-wrap gap-1.5">
          {quickQuestions.map((q) => (
            <button
              key={q}
              className="px-2 py-1 text-[11px] text-slate-400 hover:text-white bg-transparent hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-full transition-colors"
              onClick={() => {
                const input = document.querySelector<HTMLTextAreaElement>("[data-copilot-chat-input]");
                if (input) {
                  input.value = q;
                  input.focus();
                }
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 min-h-0 relative copilot-chat-wrapper">
        <CopilotChat
          className="h-full"
          metadata={{
            investigationId,
            emailId: emailId ?? undefined,
          }}
          labels={{
            inputPlaceholder: "Ask about this email, sender, or campaign...",
            title: "",
          }}
          showHeader={false}
          icons={{
            user: (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[10px] text-slate-300">
                U
              </div>
            ),
            assistant: (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600/20 text-[10px] text-emerald-400">
                AI
              </div>
            ),
          }}
        />
        <style jsx global>{`
          /* Hide CopilotKit branding */
          .copilot-chat-wrapper a[href*="copilotkit"],
          .copilot-chat-wrapper [class*="powered"],
          .copilot-chat-wrapper [class*="branding"],
          .copilot-chat-wrapper [class*="PoweredBy"],
          .copilot-chat-wrapper div:has(> a[href*="copilotkit"]) {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            height: 0 !important;
            overflow: hidden !important;
            position: absolute !important;
          }
        `}</style>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="px-4 py-2 border-t border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Processing...</span>
          </div>
        </div>
      )}
    </div>
  );
}
