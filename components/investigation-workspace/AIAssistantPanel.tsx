"use client"

import { useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronRight,
  FileCode,
  Link,
  Network,
  Send,
  Sparkles,
  User,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface Message {
  role: "user" | "assistant"
  content: string
  timestamp: Date
  collapsed?: boolean
  error?: boolean
}

interface AIAssistantPanelProps {
  emailId: string
  onQuery?: (query: string) => void
}

const quickActions = [
  { label: "Why Flagged?", icon: AlertTriangle, prompt: "Why was this email flagged?" },
  { label: "Sender Risk", icon: User, prompt: "Assess the sender risk for this email." },
  { label: "Analyze Header", icon: FileCode, prompt: "Analyze the email headers for anomalies." },
  { label: "URLs in Email", icon: Link, prompt: "Extract and analyze URLs in this email." },
  { label: "Similar Incidents", icon: Network, prompt: "Find similar incidents or campaigns." },
  { label: "Larger Campaign?", icon: Users, prompt: "Is this email part of a wider campaign?" },
]

export function AIAssistantPanel({ emailId, onQuery }: AIAssistantPanelProps) {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  const sendToAssistant = async (prompt: string) => {
    if (!prompt.trim() || !emailId) return

    const userMessage: Message = { role: "user", content: prompt.trim(), timestamp: new Date() }
    setMessages((prev) => [...prev, userMessage])
    setIsTyping(true)
    onQuery?.(prompt)

    try {
      const response = await fetch("/api/investigate/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: prompt.trim(),
          messageId: emailId,
        }),
      })

      const data = await response.json()
      const assistantContent = data?.response || data?.answer || data?.message

      const assistantMessage: Message = {
        role: "assistant",
        content: assistantContent || "No response returned from the investigation service.",
        timestamp: new Date(),
        error: !data?.success,
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Investigation assistant unavailable."
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: message,
          timestamp: new Date(),
          error: true,
        },
      ])
    } finally {
      setIsTyping(false)
      setInput("")
    }
  }

  const toggleCollapse = (index: number) => {
    setMessages((prev) => prev.map((msg, i) => (i === index ? { ...msg, collapsed: !msg.collapsed } : msg)))
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal to-electric-blue flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">Investigation Assistant</h3>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-cyber-green animate-pulse" />
              <span className="text-xs text-muted-foreground">Connected</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 border-b border-border/50 shrink-0">
        <p className="text-xs text-muted-foreground mb-2">Quick Actions</p>
        <div className="flex flex-wrap gap-1.5">
          {quickActions.map((action, index) => (
            <Button
              key={index}
              variant="outline"
              size="sm"
              className="text-xs h-7 gap-1 bg-secondary/50 hover:bg-teal/20 hover:border-teal/50 transition-smooth"
              onClick={() => sendToAssistant(action.prompt)}
              disabled={isTyping || !emailId}
            >
              <action.icon className="w-3 h-3" />
              {action.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm font-medium text-foreground mb-1">Start Your Investigation</p>
            <p className="text-xs text-muted-foreground max-w-[220px] mx-auto">
              Ask about senders, campaigns, relationships, anomalies, and security signals.
            </p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className="space-y-2">
              {msg.role === "user" ? (
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <User className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-foreground pt-0.5">{msg.content}</p>
                </div>
              ) : (
                <div className="ml-8 glass-card rounded-lg overflow-hidden border border-border/60">
                  <button
                    className="w-full flex items-center justify-between p-3 hover:bg-secondary/30 transition-smooth"
                    onClick={() => toggleCollapse(index)}
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3 h-3 text-teal" />
                      <span className="text-xs font-medium text-foreground">
                        {msg.error ? "Investigation Assistant (error)" : "Investigator Note"}
                      </span>
                    </div>
                    {msg.collapsed ? (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  {!msg.collapsed && (
                    <div className="px-3 pb-3">
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {isTyping && (
          <div className="flex items-center gap-2 ml-8">
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-teal animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-2 h-2 rounded-full bg-teal animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-2 h-2 rounded-full bg-teal animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span className="text-xs text-muted-foreground">Analyzing...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 border-t border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendToAssistant(input)
            }}
            placeholder={emailId ? "Ask about this investigation..." : "Waiting for email data..."}
            className="flex-1 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal/50 transition-smooth disabled:opacity-60"
            disabled={!emailId || isTyping}
          />
          <Button
            size="sm"
            className="bg-gradient-to-r from-teal to-electric-blue text-primary-foreground hover:opacity-90"
            onClick={() => sendToAssistant(input)}
            disabled={!input.trim() || isTyping || !emailId}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
