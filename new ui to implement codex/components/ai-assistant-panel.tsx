"use client"

import { useState, useRef, useEffect } from "react"
import {
  Sparkles,
  Send,
  AlertTriangle,
  User,
  FileCode,
  Link,
  Users,
  Network,
  ChevronDown,
  ChevronRight,
  Bot,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface AIAssistantPanelProps {
  onQuery: (query: string) => void
}

const quickActions = [
  { label: "Why Flagged?", icon: AlertTriangle },
  { label: "Sender Risk", icon: User },
  { label: "Analyze Header", icon: FileCode },
  { label: "URLs in Email", icon: Link },
  { label: "Similar Incidents", icon: Network },
  { label: "Larger Campaign?", icon: Users },
]

const sampleResponses = [
  {
    query: "Why was this email flagged?",
    response:
      "This email was flagged for multiple reasons:\n\n1. **Domain Spoofing**: The sender domain 'bank0famerica.com' uses a zero instead of 'o' to mimic Bank of America.\n\n2. **Malicious Attachment**: The PDF attachment contains embedded JavaScript that attempts to execute a payload.\n\n3. **Suspicious URL**: The verification link redirects to a known phishing domain.\n\n4. **ML Detection**: Our phishing detection model scored this email at 94% confidence for being malicious.",
    collapsed: false,
  },
]

export function AIAssistantPanel({ onQuery }: AIAssistantPanelProps) {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState(sampleResponses)
  const [isTyping, setIsTyping] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  const handleSend = () => {
    if (!input.trim()) return

    setIsTyping(true)
    onQuery(input)

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          query: input,
          response: `Analyzing your query: "${input}"...\n\nBased on my investigation, I found that this relates to the ongoing phishing campaign. The sender has been active since January 10th and has targeted 47 recipients across your organization.`,
          collapsed: false,
        },
      ])
      setIsTyping(false)
      setInput("")
    }, 1500)
  }

  const toggleCollapse = (index: number) => {
    setMessages((prev) => prev.map((msg, i) => (i === index ? { ...msg, collapsed: !msg.collapsed } : msg)))
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal to-electric-blue flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">Investigation Assistant</h3>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-cyber-green animate-pulse" />
              <span className="text-xs text-muted-foreground">Ready</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="p-4 border-b border-border/50 shrink-0">
        <p className="text-xs text-muted-foreground mb-2">Quick Actions</p>
        <div className="flex flex-wrap gap-1.5">
          {quickActions.map((action, index) => (
            <Button
              key={index}
              variant="outline"
              size="sm"
              className="text-xs h-7 gap-1 bg-secondary/50 hover:bg-teal/20 hover:border-teal/50 transition-smooth"
              onClick={() => {
                setInput(action.label)
                onQuery(action.label)
              }}
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
            <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">
              Ask me about senders, campaigns, relationships, anomalies, and security signals.
            </p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className="space-y-2">
              {/* User Query */}
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <User className="w-3 h-3 text-muted-foreground" />
                </div>
                <p className="text-sm text-foreground pt-0.5">{msg.query}</p>
              </div>

              {/* AI Response */}
              <div className="ml-8 glass-card rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-3 hover:bg-secondary/30 transition-smooth"
                  onClick={() => toggleCollapse(index)}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3 h-3 text-teal" />
                    <span className="text-xs font-medium text-foreground">Investigator Note</span>
                  </div>
                  {msg.collapsed ? (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
                {!msg.collapsed && (
                  <div className="px-3 pb-3">
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{msg.response}</p>
                  </div>
                )}
              </div>
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
        {/* Scroll anchor */}
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask about this investigation..."
            className="flex-1 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal/50 transition-smooth"
          />
          <Button
            size="sm"
            className="bg-gradient-to-r from-teal to-electric-blue text-primary-foreground hover:opacity-90"
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
