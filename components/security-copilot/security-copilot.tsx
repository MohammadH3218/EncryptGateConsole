// components/security-copilot/security-copilot-enhanced.tsx
"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Bot, Send, Loader2, AlertTriangle, CheckCircle, Info } from "lucide-react"

interface Message {
  id: string
  type: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  isLoading?: boolean
  metadata?: {
    query?: string
    results?: any[]
    confidence?: number
  }
}

interface SecurityCopilotEnhancedProps {
  detectionData?: any
  emailData?: any
  messageId?: string
  className?: string
}

export function SecurityCopilotEnhanced({
  detectionData,
  emailData,
  messageId,
  className = ""
}: SecurityCopilotEnhancedProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [context, setContext] = useState<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Initialize with welcome message and context
  useEffect(() => {
    const welcomeMessage: Message = {
      id: 'welcome',
      type: 'system',
      content: messageId 
        ? `Hello! I'm your Security Copilot. I can help you investigate this email by querying our knowledge graph and providing insights. What would you like to know?`
        : `Hello! I'm your Security Copilot. I can analyze security data and answer questions about emails, threats, and investigations. How can I help?`,
      timestamp: new Date(),
    }
    
    setMessages([welcomeMessage])
    
    // Load context if messageId is provided
    if (messageId) {
      loadEmailContext(messageId)
    }
  }, [messageId])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const loadEmailContext = async (msgId: string) => {
    try {
      const response = await fetch('/api/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_email_context',
          data: { messageId: msgId }
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        setContext(result.context)
      }
    } catch (error) {
      console.error('Failed to load email context:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    const loadingMessage: Message = {
      id: (Date.now() + 1).toString(),
      type: 'assistant',
      content: 'Analyzing your question...',
      timestamp: new Date(),
      isLoading: true,
    }

    setMessages(prev => [...prev, userMessage, loadingMessage])
    setInput("")
    setIsLoading(true)

    try {
      // Query the Neo4j copilot
      const response = await fetch('/api/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'query_copilot',
          data: {
            question: userMessage.content,
            messageId: messageId,
            context: context || emailData,
            detectionData: detectionData
          }
        })
      })

      const result = await response.json()

      if (response.ok) {
        const assistantMessage: Message = {
          id: (Date.now() + 2).toString(),
          type: 'assistant',
          content: result.response || 'I was able to process your question, but no specific response was generated.',
          timestamp: new Date(),
          metadata: {
            confidence: 85, // Could come from API
          }
        }

        setMessages(prev => 
          prev.filter(m => !m.isLoading).concat(assistantMessage)
        )
      } else {
        throw new Error(result.error || 'Failed to get response')
      }
    } catch (error) {
      console.error('Copilot query error:', error)
      
      const errorMessage: Message = {
        id: (Date.now() + 3).toString(),
        type: 'assistant',
        content: 'I encountered an error processing your question. Please try again or rephrase your query.',
        timestamp: new Date(),
      }

      setMessages(prev => 
        prev.filter(m => !m.isLoading).concat(errorMessage)
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleSuggestedQuestion = (question: string) => {
    setInput(question)
  }

  const suggestedQuestions = messageId ? [
    "What makes this email suspicious?",
    "Who else has received similar emails?",
    "Analyze the sender's reputation",
    "What actions should I take?",
    "Show me the email's connections",
    "Explain the risk level",
    "Find similar past incidents",
  ] : [
    "Show me recent high-risk emails",
    "Who are the most targeted users?",
    "What are the latest threat trends?",
    "Analyze suspicious domains",
    "Show me phishing patterns",
  ]

  return (
    <Card className={`flex flex-col h-full ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bot className="h-5 w-5 text-primary" />
          Security Copilot
          <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 text-xs">
            Neo4j Enhanced
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0">
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-4 pb-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg p-3 ${
                  message.type === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : message.type === 'system'
                    ? 'bg-muted border border-border'
                    : 'bg-secondary'
                }`}>
                  <div className="flex items-start gap-2">
                    {message.isLoading && (
                      <Loader2 className="h-4 w-4 animate-spin mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      {message.metadata?.confidence && (
                        <div className="flex items-center gap-1 mt-2">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span className="text-xs text-muted-foreground">
                            Confidence: {message.metadata.confidence}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Suggested Questions */}
        {messages.length <= 1 && (
          <div className="px-4 py-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">Suggested questions:</p>
            <div className="flex flex-col gap-1">
              {suggestedQuestions.slice(0, 4).map((question, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  className="justify-start h-auto py-2 px-2 text-xs"
                  onClick={() => handleSuggestedQuestion(question)}
                >
                  {question}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Context Info */}
        {context && (
          <div className="px-4 py-2 border-t">
            <div className="flex items-center gap-1 mb-1">
              <Info className="h-3 w-3 text-blue-500" />
              <span className="text-xs text-muted-foreground">Email Context Loaded</span>
            </div>
            <div className="text-xs text-muted-foreground">
              From: {context.sender} • {context.recipients?.length || 0} recipient(s)
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this investigation..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button 
              type="submit" 
              size="icon" 
              disabled={isLoading || !input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  )
}