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
        // Extract emailId from metadata
        const emailId = metadata?.emailId as string | undefined;
        if (!emailId) {
          yield {
            type: "text-delta" as const,
            textDelta: "Error: emailId is required in metadata. Please provide the email ID for investigation.",
          };
          return;
        }

        // Fetch email context
        let emailContext = "";
        try {
          emailContext = await fetchEmailContext(emailId);
          if (!emailContext) {
            emailContext = `Email ID: ${emailId}\nNote: Email context not available in graph database.`;
          }
        } catch (error: any) {
          emailContext = `Email ID: ${emailId}\nNote: Neo4j connection unavailable.`;
        }

        // Build initial messages for agent
        const initialMessages: any[] = [
          {
            role: "system",
            content: getAgentSystemPrompt(emailId, emailContext),
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

const copilotRuntime = new CopilotRuntime(copilotRuntimeConfig);

export const { GET, POST } = copilotRuntimeNextJSAppRouterEndpoint({
  runtime: copilotRuntime,
});

