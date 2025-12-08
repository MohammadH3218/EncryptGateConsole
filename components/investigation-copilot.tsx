"use client";

// components/investigation-copilot.tsx - Modern CopilotKit-style investigation assistant
// This component provides a CopilotKit-like UI while using our existing agent system

import { useState, useEffect, useRef } from "react";
import {
  Bot,
  Send,
  Sparkles,
  AlertTriangle,
  Shield,
  Users,
  History,
  ChevronDown,
  ChevronRight,
  Terminal,
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
  Network,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  formatMarkdown,
  formatSecurityContent,
  getEmailReferencesData,
} from "@/lib/copilot-formatting";
import { GraphVisualization, GraphData } from "@/components/graph-visualization";
import {
  extractGraphFromToolResults,
  shouldShowGraph,
} from "@/lib/graph-utils";

interface InvestigationCopilotProps {
  emailId: string;
  onEmailClick?: (emailId: string) => void;
  quickActions?: Array<{
    id: string;
    label: string;
    icon: any;
    pipeline: string;
    description: string;
  }>;
  suggestedQuestions?: string[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
  isPipeline?: boolean;
  isError?: boolean;
  thinking?: {
    steps: any[];
    toolCalls: any[];
    toolResults: any[];
    expanded: boolean;
  };
  duration?: number;
  tokensUsed?: number;
  graphData?: GraphData;
}

export function InvestigationCopilot({
  emailId,
  onEmailClick,
  quickActions = [],
  suggestedQuestions = [],
}: InvestigationCopilotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [currentThinking, setCurrentThinking] = useState<any>(null);
  const [expandedGraphIndex, setExpandedGraphIndex] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentThinking]);

  async function startStreamingInvestigation(
    pipelineId?: string,
    customQuestion?: string
  ) {
    if (streaming) return;

    const userMessage: Message = {
      role: "user",
      content:
        customQuestion ||
        quickActions.find((a) => a.pipeline === pipelineId)?.label ||
        "Investigation",
      isPipeline: !!pipelineId,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setStreaming(true);
    setCurrentThinking({
      steps: [],
      toolCalls: [],
      toolResults: [],
      expanded: false,
    });

    const startTime = Date.now();

    try {
      const response = await fetch("/api/agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailId,
          pipeline: pipelineId,
          question: customQuestion,
          messages: messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              role: m.role,
              content: m.content,
            })),
          maxHops: 8,
        }),
      });

      if (!response.ok) {
        throw new Error(`Stream failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No response body");

      let buffer = "";
      let finalAnswer = "";
      let totalTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || !line.startsWith("data: ")) continue;

          try {
            const event = JSON.parse(line.slice(6));

            switch (event.type) {
              case "thinking":
                setCurrentThinking((prev: any) => ({
                  ...prev,
                  steps: [...(prev?.steps || []), event.data],
                }));
                break;

              case "tool_call":
                setCurrentThinking((prev: any) => ({
                  ...prev,
                  toolCalls: [...(prev?.toolCalls || []), event.data],
                }));
                break;

              case "tool_result":
                setCurrentThinking((prev: any) => ({
                  ...prev,
                  toolResults: [...(prev?.toolResults || []), event.data],
                }));
                break;

              case "answer":
                finalAnswer = event.data.content;
                totalTokens = event.data.tokensUsed || 0;
                break;

              case "done":
                const duration = Date.now() - startTime;
                const graphData = currentThinking?.toolResults
                  ? extractGraphFromToolResults(currentThinking.toolResults)
                  : null;

                setMessages((prev) => [
                  ...prev,
                  {
                    role: "assistant",
                    content: finalAnswer || "Investigation complete.",
                    thinking: currentThinking,
                    duration,
                    tokensUsed: totalTokens,
                    graphData: graphData || undefined,
                  },
                ]);
                setCurrentThinking(null);
                setStreaming(false);
                break;

              case "error":
                throw new Error(event.data.message);
            }
          } catch (parseError) {
            console.error("Failed to parse SSE event:", parseError);
          }
        }
      }
    } catch (error: any) {
      console.error("Streaming error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${error.message}`,
          isError: true,
        },
      ]);
      setCurrentThinking(null);
      setStreaming(false);
    }
  }

  function runPipeline(pipelineId: string) {
    startStreamingInvestigation(pipelineId);
  }

  function sendMessage() {
    if (!input.trim() || streaming) return;
    startStreamingInvestigation(undefined, input);
  }

  function toggleThinking(index: number) {
    setMessages((prev) =>
      prev.map((msg, i) => {
        if (i === index && msg.thinking) {
          return {
            ...msg,
            thinking: {
              ...msg.thinking,
              expanded: !msg.thinking.expanded,
            },
          };
        }
        return msg;
      })
    );
  }

  function handleEmailClick(emailId: string) {
    onEmailClick?.(emailId);
  }

  function renderFormattedContent(content: string) {
    const { hasReferences, textParts } = getEmailReferencesData(content);

    const renderSegment = (segment: string, key: string) => {
      const formatted = formatSecurityContent(formatMarkdown(segment));
      return <span key={key} dangerouslySetInnerHTML={{ __html: formatted }} />;
    };

    if (!hasReferences) {
      return (
        <div
          className="prose prose-invert prose-sm max-w-none leading-relaxed"
          dangerouslySetInnerHTML={{
            __html: formatSecurityContent(formatMarkdown(content)),
          }}
        />
      );
    }

    return (
      <div className="prose prose-invert prose-sm max-w-none leading-relaxed flex flex-wrap items-start gap-1">
        {textParts.map((part) => {
          if (part.type === "text") {
            return renderSegment(part.content, `text-${part.index}`);
          }

          const ref = part.reference!;
          const display =
            ref.emailId.length > 36
              ? `${ref.emailId.slice(0, 32)}…`
              : ref.emailId;

          return (
            <button
              key={`email-ref-${part.index}`}
              onClick={() => handleEmailClick(ref.emailId)}
              className="inline-flex items-center gap-1 rounded-md border border-app-ring/60 bg-app-accent/15 px-2 py-1 font-mono text-[11px] text-app-accent transition-all hover:bg-app-accent/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/50"
              title="Click to preview email"
            >
              <Mail className="h-3 w-3" />
              {display}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col bg-gradient-to-b from-neutral-900/50 to-neutral-950 h-full">
      {/* Copilot Header - CopilotKit Style */}
      <div className="border-b border-neutral-800 px-6 py-4 bg-neutral-900/50 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-sm text-neutral-100">
                Investigation Assistant
              </h2>
              <p className="text-xs text-neutral-400">AI-powered analysis</p>
            </div>
          </div>
          {streaming && (
            <Badge
              variant="outline"
              className="text-xs bg-blue-600/10 border-blue-500/50 text-blue-400"
            >
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Streaming
            </Badge>
          )}
        </div>
      </div>

      {/* Quick Actions - CopilotKit Style */}
      {quickActions.length > 0 && (
        <div className="border-b border-neutral-800 px-6 py-3 bg-neutral-900/30">
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.id}
                  size="sm"
                  variant="outline"
                  onClick={() => runPipeline(action.pipeline)}
                  disabled={streaming}
                  className="text-xs h-8 px-3 bg-neutral-800/50 border-neutral-700 hover:bg-blue-600/10 hover:border-blue-500/50 hover:text-blue-400 transition-all"
                  title={action.description}
                >
                  <Icon className="w-3.5 h-3.5 mr-1.5" />
                  {action.label}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Chat Messages - CopilotKit Style */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="px-6 py-4 space-y-6">
            {messages.length === 0 && !streaming ? (
              <div className="space-y-6">
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center border border-blue-500/30">
                    <Bot className="w-8 h-8 text-blue-400" />
                  </div>
                  <p className="text-sm text-neutral-200 mb-1 font-medium">
                    Ready to investigate this email
                  </p>
                  <p className="text-xs text-neutral-500">
                    Choose a quick action above or ask a custom question
                  </p>
                </div>

                {suggestedQuestions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-neutral-500 font-medium px-2">
                      Suggested questions:
                    </p>
                    {suggestedQuestions.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => setInput(q)}
                        className="block w-full text-left text-sm px-4 py-3 rounded-xl bg-neutral-800/50 hover:bg-neutral-800 transition-all text-neutral-300 hover:text-neutral-100 border border-neutral-700/50 hover:border-neutral-600 hover:shadow-md"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex gap-4 ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center border border-blue-500/30 shrink-0">
                        <Bot className="w-5 h-5 text-blue-400" />
                      </div>
                    )}

                    <div
                      className={`flex-1 max-w-[85%] ${
                        msg.role === "user" ? "order-2" : "order-1"
                      }`}
                    >
                      {/* Message bubble - CopilotKit style */}
                      <div
                        className={`rounded-2xl p-4 shadow-lg ${
                          msg.role === "user"
                            ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white ml-auto"
                            : msg.isError
                              ? "bg-red-900/20 border border-red-900/50 text-red-300"
                              : "bg-neutral-800/70 text-neutral-100 border border-neutral-700/50"
                        }`}
                      >
                        {msg.isPipeline && (
                          <div className="flex items-center gap-2 mb-3 text-xs opacity-90">
                            <Sparkles className="w-3 h-3" />
                            <span>Running automated workflow...</span>
                          </div>
                        )}
                        <div className="text-sm leading-relaxed">
                          {renderFormattedContent(msg.content)}
                        </div>
                        {msg.duration && (
                          <div className="mt-3 pt-3 border-t border-neutral-700/50 text-[10px] text-neutral-400 flex items-center gap-3">
                            <span>{msg.duration}ms</span>
                            <span>•</span>
                            <span>{msg.tokensUsed || 0} tokens</span>
                          </div>
                        )}
                      </div>

                      {/* Graph Visualization */}
                      {msg.graphData && shouldShowGraph(msg) && (
                        <div className="mt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                          <button
                            onClick={() =>
                              setExpandedGraphIndex(
                                expandedGraphIndex === i ? null : i
                              )
                            }
                            className="flex items-center gap-2 text-xs text-neutral-400 hover:text-neutral-200 transition-colors group mb-2"
                          >
                            {expandedGraphIndex === i ? (
                              <ChevronDown className="w-3.5 h-3.5 group-hover:text-blue-400" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 group-hover:text-blue-400" />
                            )}
                            <Network className="w-3.5 h-3.5" />
                            <span className="font-medium">
                              Graph Visualization (
                              {msg.graphData.nodes.length} nodes,{" "}
                              {msg.graphData.edges.length} relationships)
                            </span>
                          </button>

                          {expandedGraphIndex === i && (
                            <div className="mt-3 animate-in fade-in slide-in-from-top-4 duration-300">
                              <GraphVisualization
                                data={msg.graphData}
                                height={500}
                                onNodeClick={(node) => {
                                  if (
                                    node.type === "Email" &&
                                    node.properties?.messageId
                                  ) {
                                    handleEmailClick(node.properties.messageId);
                                  }
                                }}
                                className="border border-neutral-800 rounded-lg"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Thinking section */}
                      {msg.thinking && (
                        <div className="mt-3">
                          <button
                            onClick={() => toggleThinking(i)}
                            className="flex items-center gap-2 text-xs text-neutral-400 hover:text-neutral-200 transition-colors group"
                          >
                            {msg.thinking.expanded ? (
                              <ChevronDown className="w-3.5 h-3.5 group-hover:text-blue-400" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 group-hover:text-blue-400" />
                            )}
                            <Terminal className="w-3.5 h-3.5" />
                            <span className="font-medium">
                              Thinking ({msg.thinking.steps.length} steps,{" "}
                              {msg.thinking.toolCalls.length} queries)
                            </span>
                          </button>

                          {msg.thinking.expanded && (
                            <div className="mt-3 ml-6 space-y-2 text-xs bg-neutral-900/50 rounded-lg p-3 border border-neutral-800">
                              {msg.thinking.steps.map((step: any, si: number) => (
                                <div
                                  key={si}
                                  className="flex items-start gap-2 text-neutral-400"
                                >
                                  <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500" />
                                  <span>
                                    <span className="text-neutral-500">
                                      Step {step.step}:
                                    </span>{" "}
                                    {step.action}
                                  </span>
                                </div>
                              ))}

                              {msg.thinking.toolCalls.map(
                                (call: any, ci: number) => {
                                  const result =
                                    msg.thinking?.toolResults?.[ci];
                                  return (
                                    <div
                                      key={ci}
                                      className="pl-5 border-l-2 border-neutral-700/50 ml-1"
                                    >
                                      <div className="flex items-center gap-2 font-mono text-blue-400 mb-1">
                                        <Terminal className="w-3 h-3" />
                                        <span className="text-xs">
                                          {call.toolName}
                                        </span>
                                        {result &&
                                          (result.success ? (
                                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                          ) : (
                                            <XCircle className="w-3.5 h-3.5 text-red-500" />
                                          ))}
                                      </div>
                                      <pre className="mt-1 text-[10px] text-neutral-500 overflow-x-auto bg-neutral-950 p-2 rounded">
                                        {JSON.stringify(call.args, null, 2)}
                                      </pre>
                                      {result && (
                                        <div className="mt-1.5 text-neutral-500 text-xs">
                                          →{" "}
                                          {result.success ? (
                                            <span className="text-green-500">
                                              Success
                                            </span>
                                          ) : (
                                            <span className="text-red-500">
                                              Failed
                                            </span>
                                          )}
                                          {result.result?.rowCount && (
                                            <span className="ml-1">
                                              ({result.result.rowCount} rows)
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                }
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {msg.role === "user" && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0 order-1">
                        <span className="text-xs font-semibold text-white">
                          U
                        </span>
                      </div>
                    )}
                  </div>
                ))}

                {/* Current streaming thinking */}
                {streaming && currentThinking && (
                  <div className="flex gap-4 justify-start">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center border border-blue-500/30 shrink-0">
                      <Bot className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1 max-w-[85%]">
                      <div className="rounded-2xl p-4 bg-neutral-800/50 border border-neutral-700 shadow-md">
                        <div className="flex items-center gap-2 text-sm text-neutral-300 mb-3">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                          <span className="font-medium">Thinking...</span>
                        </div>

                        <div className="space-y-2 text-xs">
                          {currentThinking.steps.map(
                            (step: any, i: number) => (
                              <div
                                key={i}
                                className="flex items-start gap-2 text-neutral-400"
                              >
                                <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500" />
                                <span>
                                  Step {step.step}: {step.action}
                                </span>
                              </div>
                            )
                          )}

                          {currentThinking.toolCalls.map(
                            (call: any, i: number) => {
                              const result = currentThinking.toolResults?.[i];
                              return (
                                <div
                                  key={i}
                                  className="pl-5 border-l-2 border-neutral-700/50 ml-1"
                                >
                                  <div className="flex items-center gap-2 font-mono text-blue-400">
                                    <Terminal className="w-3 h-3" />
                                    <span className="text-xs">
                                      {call.toolName}
                                    </span>
                                    {result &&
                                      (result.success ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                      ) : (
                                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                                      ))}
                                  </div>
                                  {result && (
                                    <div className="mt-1 text-neutral-500 text-xs">
                                      →{" "}
                                      {result.success ? (
                                        <span className="text-green-500">
                                          Success
                                        </span>
                                      ) : (
                                        <span className="text-red-500">
                                          Failed
                                        </span>
                                      )}
                                      {result.result?.rowCount && (
                                        <span className="ml-1">
                                          ({result.result.rowCount} rows)
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            }
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Input - CopilotKit Style */}
      <div className="border-t border-neutral-800 p-4 bg-neutral-900/30 backdrop-blur-sm">
        <div className="flex gap-3">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask about this email..."
            className="min-h-[56px] max-h-[120px] bg-neutral-800/50 border-neutral-700 resize-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 rounded-xl"
            disabled={streaming}
          />
          <Button
            onClick={sendMessage}
            disabled={streaming || !input.trim()}
            size="icon"
            className="shrink-0 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 h-[56px] w-[56px] rounded-xl shadow-lg"
          >
            {streaming ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-neutral-500 mt-2 px-1">
          Press{" "}
          <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-400">
            Enter
          </kbd>{" "}
          to send •{" "}
          <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-400">
            Shift+Enter
          </kbd>{" "}
          for new line
        </p>
      </div>
    </div>
  );
}

