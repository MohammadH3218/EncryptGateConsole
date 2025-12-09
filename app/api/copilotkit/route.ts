// app/api/copilotkit/route.ts - CopilotKit runtime endpoint
import { NextRequest } from "next/server";
import {
  CopilotRuntime,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { agentLoopStream } from "@/lib/agent-stream";
import { getAgentSystemPrompt } from "@/lib/agent";
import { fetchEmailContext } from "@/lib/neo4j";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create the runtime configuration
const copilotRuntimeConfig = {
  agents: {
    default: {
      async *streamingChatCompletion({ messages, metadata }: any) {
        // Extract emailId from metadata (can be from metadata.emailId or metadata.investigationId)
        const emailId = (metadata?.emailId || metadata?.investigationId) as string | undefined;
        
        // If no emailId, try to work without it but warn the user
        let emailContext = "";
        if (emailId) {
          try {
            emailContext = await fetchEmailContext(emailId);
            if (!emailContext) {
              emailContext = `Email ID: ${emailId}\nNote: Email context not available in graph database.`;
            }
          } catch (error: any) {
            console.warn('Failed to fetch email context:', error);
            emailContext = `Email ID: ${emailId}\nNote: Neo4j connection unavailable.`;
          }
        } else {
          // Work without email context - provide a general system prompt
          emailContext = "General security investigation context. No specific email ID provided.";
          console.warn('Copilot called without emailId in metadata');
        }

        // Build initial messages for agent
        const initialMessages: any[] = [
          {
            role: "system",
            content: emailId 
              ? getAgentSystemPrompt(emailId, emailContext)
              : `You are EncryptGate Security Copilot, an expert email security analyst assistant.

You help security analysts investigate emails, analyze threats, and understand email relationships.

**Available Tools:**
- inspect_schema: View Neo4j graph database structure
- run_cypher: Execute read-only Cypher queries
- run_gds: Run Graph Data Science algorithms

**Your Approach:**
1. Understand the analyst's question
2. Use appropriate tools to gather evidence
3. Provide clear, actionable insights
4. Reference specific data from your queries

**Context:** ${emailContext}

Be helpful, thorough, and security-focused.`,
          },
          ...messages.slice(0, -1).map((m: any) => ({
            role: m.role,
            content: m.content,
          })),
          {
            role: "user",
            content: messages[messages.length - 1]?.content || "",
          },
        ];

        // Stream from agent
        let accumulatedAnswer = "";
        for await (const event of agentLoopStream(initialMessages, 8)) {
          if (event.type === "answer") {
            const content = event.data.content || "";
            // Yield the delta (new content since last yield)
            const delta = content.slice(accumulatedAnswer.length);
            if (delta) {
              yield {
                type: "text-delta" as const,
                textDelta: delta,
              };
              accumulatedAnswer = content;
            }
          } else if (event.type === "done") {
            // Finalize if needed
            return;
          } else if (event.type === "error") {
            yield {
              type: "text-delta" as const,
              textDelta: `\n\nError: ${event.data?.message || "Unknown error occurred"}`,
            };
            return;
          }
        }
      },
    },
  },
};

// Lazy initialization to prevent build-time evaluation issues
let endpointHandlers: { GET: any; POST: any } | null = null;

function getEndpointHandlers() {
  if (!endpointHandlers) {
    const copilotRuntime = new CopilotRuntime(copilotRuntimeConfig);
    endpointHandlers = copilotRuntimeNextJSAppRouterEndpoint({
      runtime: copilotRuntime,
    });
  }
  return endpointHandlers;
}

// Export handlers that lazily initialize
export async function GET(req: NextRequest) {
  const handlers = getEndpointHandlers();
  return handlers.GET(req);
}

export async function POST(req: NextRequest) {
  const handlers = getEndpointHandlers();
  return handlers.POST(req);
}

