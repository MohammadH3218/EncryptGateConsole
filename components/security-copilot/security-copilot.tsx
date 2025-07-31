// components/security-copilot/security-copilot.tsx
"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Bot, Send, Loader2, AlertTriangle, CheckCircle, Info, Zap } from "lucide-react"

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
    error?: string
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
  const [isConnected, setIsConnected] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Initialize with welcome message and context
  useEffect(() => {
    const welcomeMessage: Message = {
      id: 'welcome',
      type: 'system',
      content: messageId 
        ? `Hello! I'm your Security Copilot powered by Neo4j and advanced AI. I can analyze the email graph, find patterns, and help with your investigation. What would you like to know about this email?`
        : `Hello! I'm your Security Copilot. I can analyze email relationships, detect patterns, and provide security insights using our knowledge graph. How can I assist you?`,
      timestamp: new Date(),
    }
    
    setMessages([welcomeMessage])
    setIsConnected(true)
    
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
      console.log('🔍 Loading email context for:', msgId)
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
        console.log('✅ Email context loaded:', result.context)
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
      content: 'Analyzing your question using the knowledge graph...',
      timestamp: new Date(),
      isLoading: true,
    }

    setMessages(prev => [...prev, userMessage, loadingMessage])
    setInput("")
    setIsLoading(true)

    try {
      console.log('🤖 Sending query to copilot:', userMessage.content)
      
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
      console.log('🤖 Copilot response:', result)

      if (response.ok) {
        const assistantMessage: Message = {
          id: (Date.now() + 2).toString(),
          type: 'assistant',
          content: result.response || 'I processed your question but couldn\'t generate a specific response. Could you try rephrasing?',
          timestamp: new Date(),
          metadata: {
            confidence: result.confidence || 85,
            error: result.error,
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
        content: 'I encountered an error processing your question. The knowledge graph might be initializing or there could be a connection issue. Please try again in a moment.',
        timestamp: new Date(),
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
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
    "Who else has received similar emails?",
    "What makes this email suspicious?",
    "Analyze the sender's email history",
    "What actions should I take?",
  ] : [
    "Show me recent phishing attempts",
    "Who are the most targeted users?",
    "Find emails with suspicious URLs",
    "What are the latest threat patterns?",
  ]

  // Remove border styling from Card when border-0 class is present
  const cardClassName = className.includes('border-0') 
    ? `flex flex-col h-full ${className.replace('border-0', '')} border-0 shadow-none`
    : `flex flex-col h-full ${className}`

  return (
    <Card className={cardClassName}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bot className="h-5 w-5 text-primary" />
          Security Copilot
          <div className="flex gap-1">
            <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs">
              <Zap className="h-3 w-3 mr-1" />
              Neo4j
            </Badge>
            <Badge variant="outline" className={`text-xs ${
              isConnected 
                ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                : 'bg-red-500/10 text-red-500 border-red-500/20'
            }`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </Badge>
          </div>
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
                      
                      {/* Show metadata */}
                      {message.metadata && (
                        <div className="mt-2 space-y-1">
                          {message.metadata.confidence && (
                            <div className="flex items-center gap-1">
                              <CheckCircle className="h-3 w-3 text-green-500" />
                              <span className="text-xs text-muted-foreground">
                                Confidence: {message.metadata.confidence}%
                              </span>
                            </div>
                          )}
                          {message.metadata.error && (
                            <div className="flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 text-yellow-500" />
                              <span className="text-xs text-muted-foreground">
                                Note: {message.metadata.error}
                              </span>
                            </div>
                          )}
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
              {suggestedQuestions.slice(0, 3).map((question, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  className="justify-start h-auto py-2 px-2 text-xs"
                  onClick={() => handleSuggestedQuestion(question)}
                  disabled={isLoading}
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
              <span className="text-xs font-medium text-muted-foreground">Email Context Loaded</span>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>From: {context.sender}</div>
              <div>To: {context.recipients?.join(', ') || 'N/A'}</div>
              <div>Subject: {context.subject}</div>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={messageId ? "Ask about this email..." : "Ask about email security..."}
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
          <p className="text-xs text-muted-foreground mt-1">
            Powered by Neo4j graph database and AI analysis
          </p>
        </div>
      </CardContent>
    </Card>
  )
}