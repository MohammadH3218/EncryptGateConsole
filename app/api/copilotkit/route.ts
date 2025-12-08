// app/api/copilotkit/route.ts - CopilotKit runtime endpoint adapter
import { NextRequest } from "next/server";
import { agentLoopStream } from "@/lib/agent-stream";
import { getAgentSystemPrompt } from "@/lib/agent";
import { fetchEmailContext } from "@/lib/neo4j";
import { INVESTIGATION_PIPELINES, PipelineType } from "@/lib/investigation-pipelines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CopilotKit runtime endpoint that bridges to our existing agent system
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Extract emailId from context or request
    const emailId = body.emailId || body.context?.emailId;
    if (!emailId) {
      return new Response(
        JSON.stringify({ error: "emailId is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get messages from CopilotKit format
    const messages = body.messages || [];
    const lastMessage = messages[messages.length - 1];
    const question = lastMessage?.content || "";

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
        content: question,
      },
    ];

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let finalAnswer = "";

          for await (const event of agentLoopStream(initialMessages, 8)) {
            if (event.type === "answer") {
              finalAnswer = event.data.content;
              // Send to CopilotKit format
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "text-delta",
                    textDelta: event.data.content,
                  })}\n\n`
                )
              );
            } else if (event.type === "done") {
              controller.enqueue(
                encoder.encode(`data: [DONE]\n\n`)
              );
              controller.close();
              return;
            }
          }
        } catch (error: any) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: error.message,
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

