"use client";

import { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  AlertTriangle,
  Shield,
  Users,
  History,
  Loader2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface InvestigationCopilotPanelProps {
  investigationId: string;
  emailId?: string | null;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

export function InvestigationCopilotPanel({
  investigationId,
  emailId,
}: InvestigationCopilotPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const quickActions = [
    { icon: Sparkles, label: "Initialize", prompt: "Initialize investigation for this email and provide an overview" },
    { icon: AlertTriangle, label: "Why Flagged?", prompt: "Why was this email flagged as suspicious?" },
    { icon: Users, label: "Who Else?", prompt: "Who else received emails from this sender?" },
    { icon: Shield, label: "Sender Risk", prompt: "What is the risk profile of this sender?" },
    { icon: History, label: "Similar Incidents", prompt: "Find similar incidents or campaigns related to this email" },
  ];

  const quickQuestions = [
    "What URLs are in this email?",
    "Has this sender sent suspicious emails before?",
    "Analyze the recipient graph for this email",
    "What's unusual about this email?",
    "Is this part of a larger phishing campaign?",
  ];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (messageText?: string) => {
    const textToSend = messageText || input.trim();
    if (!textToSend || isLoading || !emailId) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch('/api/investigate/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: textToSend,
          messageId: emailId,
        }),
      });

      const data = await response.json();

      if (data.success && data.response) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.response,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `❌ Error: ${data.error || 'Failed to get response'}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `❌ Error: ${error.message || 'Failed to send message'}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-white">Investigation Assistant</h2>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-slate-400">AI-Powered</span>
          </div>
        </div>
        <p className="text-xs text-slate-500">Neo4j graph analysis with OpenAI</p>
      </div>

      {/* Quick Actions */}
      <div className="border-b border-slate-800 px-4 py-3 flex-shrink-0">
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-600/50 rounded transition-all"
                onClick={() => handleQuickAction(action.prompt)}
                disabled={isLoading}
              >
                <Icon className="h-3 w-3" />
                {action.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Suggested Questions */}
      <div className="border-b border-slate-800 px-4 py-3 flex-shrink-0">
        <div className="flex flex-wrap gap-1.5">
          {quickQuestions.map((q) => (
            <button
              key={q}
              className="px-2 py-1 text-[11px] text-slate-400 hover:text-emerald-400 bg-transparent hover:bg-slate-900 border border-slate-800 hover:border-emerald-600/30 rounded-full transition-all"
              onClick={() => handleQuickAction(q)}
              disabled={isLoading}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-12 h-12 rounded-full bg-emerald-600/10 flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-emerald-500" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-2">Start Your Investigation</h3>
              <p className="text-xs text-slate-500 max-w-[280px]">
                Ask questions about this email, analyze sender reputation, or investigate related incidents using Neo4j graph queries.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {message.role === "assistant" && (
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600/20 border border-emerald-600/30">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    message.role === "user"
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-900 text-slate-200 border border-slate-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  <span className="text-[10px] opacity-60 mt-1 block">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {message.role === "user" && (
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 border border-slate-700">
                    <span className="text-xs text-slate-300 font-medium">U</span>
                  </div>
                )}
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600/20 border border-emerald-600/30">
                <Loader2 className="h-4 w-4 text-emerald-400 animate-spin" />
              </div>
              <div className="bg-slate-900 text-slate-200 border border-slate-800 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-emerald-500/50 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-emerald-500/50 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-emerald-500/50 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-slate-400">Analyzing with Neo4j & OpenAI...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-slate-800 p-3 flex-shrink-0 bg-slate-950">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this email, sender, or campaign..."
              disabled={isLoading}
              className="flex-1 bg-black border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-600/50 focus:border-emerald-600/50 resize-none min-h-[44px] max-h-[120px] disabled:opacity-50"
              rows={1}
              style={{
                height: 'auto',
                minHeight: '44px',
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              }}
            />
            <Button
              onClick={() => handleSendMessage()}
              disabled={!input.trim() || isLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-[44px] w-[44px] p-0 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-slate-600 mt-2 px-1">
            Press Enter to send • Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
