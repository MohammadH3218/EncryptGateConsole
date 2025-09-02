// components/security-copilot/security-copilot.tsx
"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Bot, Send, Loader2, AlertTriangle, CheckCircle, Info, Zap, WifiOff, Wifi, Trash2 } from "lucide-react"

interface Message {
  id: string
  type: 'user' | 'assistant' | 'system' | 'error'
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
  // Use a stable storage key reference to avoid re-renders
  const storageKeyRef = useRef(`copilot-state-${messageId || 'global'}`)
  
  // Initialize state from localStorage if available
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [context, setContext] = useState<any>(null)
  
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [initialized, setInitialized] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const maxRetries = 3

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Load initial state from localStorage
  useEffect(() => {
    if (isMounted && !initialized) {
      const storageKey = storageKeyRef.current
      try {
        const savedMessages = localStorage.getItem(`${storageKey}-messages`)
        const savedContext = localStorage.getItem(`${storageKey}-context`)
        
        if (savedMessages) {
          setMessages(JSON.parse(savedMessages))
        }
        if (savedContext) {
          setContext(JSON.parse(savedContext))
        }
        
        setInitialized(true)
      } catch (error) {
        console.warn('Failed to load copilot state from localStorage:', error)
        setInitialized(true)
      }
    }
  }, [isMounted, initialized])

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    if (isMounted && initialized && messages.length > 0) {
      try {
        localStorage.setItem(`${storageKeyRef.current}-messages`, JSON.stringify(messages))
      } catch (error) {
        console.warn('Failed to save messages to localStorage:', error)
      }
    }
  }, [messages, initialized, isMounted])

  // Persist context to localStorage whenever it changes
  useEffect(() => {
    if (isMounted && initialized && context) {
      try {
        localStorage.setItem(`${storageKeyRef.current}-context`, JSON.stringify(context))
      } catch (error) {
        console.warn('Failed to save context to localStorage:', error)
      }
    }
  }, [context, initialized, isMounted])

  // Initialize copilot after state is loaded
  useEffect(() => {
    if (initialized) {
      if (messages.length === 0) {
        initializeCopilot()
      } else {
        checkConnectionStatus()
      }
    }
  }, [initialized])

  const checkConnectionStatus = useCallback(async () => {
    try {
      const healthResponse = await fetch('/api/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'health_check',
          data: {}
        })
      })

      setIsConnected(healthResponse.ok)
      if (!healthResponse.ok) {
        setConnectionError('Connection check failed')
      } else {
        setConnectionError(null)
      }
    } catch (error: any) {
      setIsConnected(false)
      setConnectionError(error.message)
    }
  }, [])

  const initializeCopilot = useCallback(async () => {
    try {
      // Test connection first
      const healthResponse = await fetch('/api/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'health_check',
          data: {}
        })
      })

      if (!healthResponse.ok) {
        throw new Error(`Health check failed: ${healthResponse.status}`)
      }

      setIsConnected(true)
      setConnectionError(null)
      setRetryCount(0)

      const welcomeMessage: Message = {
        id: 'welcome',
        type: 'system',
        content: messageId 
          ? `Hello! I'm your Security Copilot. I can analyze email patterns and relationships to help with your investigation. What would you like to know about this email?`
          : `Hello! I'm your Security Copilot. I can analyze email relationships, detect patterns, and provide security insights. How can I assist you?`,
        timestamp: new Date(),
      }
      
      setMessages([welcomeMessage])
      
      // Load context if messageId is provided
      if (messageId) {
        await loadEmailContext(messageId)
      }

    } catch (error: any) {
      console.error('Failed to initialize copilot:', error)
      setIsConnected(false)
      setConnectionError(error.message)
      
      const errorMessage: Message = {
        id: 'connection-error',
        type: 'error',
        content: `Connection failed: ${error.message}. Click retry to attempt reconnection.`,
        timestamp: new Date(),
      }
      
      setMessages([errorMessage])
    }
  }, [])

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
        console.log('✅ Email context loaded:', result.context)
      } else {
        console.warn('⚠️ Failed to load email context:', response.status)
      }
    } catch (error) {
      console.warn('⚠️ Error loading email context:', error)
    }
  }

  const retryConnection = async () => {
    if (retryCount >= maxRetries) {
      const maxRetryMessage: Message = {
        id: 'max-retry-error',
        type: 'error',
        content: `Maximum retry attempts (${maxRetries}) reached. Please check your connection and refresh the page.`,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, maxRetryMessage])
      return
    }

    setRetryCount(prev => prev + 1)
    await initializeCopilot()
  }

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading || !isConnected) return

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
      console.log('🤖 Sending query to copilot:', userMessage.content)
      
      // Query the copilot with timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

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
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      console.log('✅ Copilot response received:', result)

      // Handle the case where result is undefined or null
      if (!result) {
        throw new Error('No response received from server')
      }

      // Handle error responses from the server
      if (result.error && !result.response) {
        throw new Error(result.error)
      }

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

    } catch (error: any) {
      console.error('❌ Copilot query failed:', error)
      
      let errorMessage = 'I encountered an error processing your question.'
      
      if (error.name === 'AbortError') {
        errorMessage = 'The request timed out. Please try asking a simpler question.'
      } else if (error.message.includes('fetch')) {
        errorMessage = 'Connection error. Please check your network and try again.'
        setIsConnected(false)
      } else {
        errorMessage = `Error: ${error.message}`
      }

      const errorResponseMessage: Message = {
        id: (Date.now() + 3).toString(),
        type: 'error',
        content: errorMessage,
        timestamp: new Date(),
        metadata: {
          error: error.message
        }
      }

      setMessages(prev => 
        prev.filter(m => !m.isLoading).concat(errorResponseMessage)
      )
      
    } finally {
      setIsLoading(false)
    }
  }

  const handleSuggestedQuestion = (question: string) => {
    setInput(question)
  }

  const clearChat = () => {
    setMessages([])
    setContext(null)
    // Clear localStorage for this session
    if (isMounted) {
      try {
        localStorage.removeItem(`${storageKeyRef.current}-messages`)
        localStorage.removeItem(`${storageKeyRef.current}-context`)
      } catch (error) {
        console.warn('Failed to clear localStorage:', error)
      }
    }
    // Re-initialize
    initializeCopilot()
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

  // Show loading state until component is mounted and initialized
  if (!isMounted || !initialized) {
    return (
      <Card className={`${cardClassName} bg-[#0f0f0f] border-[#2a2a2a]`}>
        <CardHeader className="pb-3 bg-[#0f0f0f]">
          <CardTitle className="flex items-center gap-2 text-lg text-white">
            <Bot className="h-5 w-5 text-blue-400" />
            Security Copilot
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center bg-[#0f0f0f]">
          <div className="flex items-center gap-2 text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Initializing...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={`${cardClassName} bg-[#0f0f0f] border-[#2a2a2a]`}>
      <CardHeader className="pb-3 bg-[#0f0f0f]">
        <CardTitle className="flex items-center justify-between text-lg text-white">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-400" />
            Security Copilot
            <div className="flex gap-1">
              <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs">
                <Zap className="h-3 w-3 mr-1" />
                Neo4j
              </Badge>
              <Badge variant="outline" className={`text-xs ${
                isConnected 
                  ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}>
                {isConnected ? (
                  <>
                    <Wifi className="h-3 w-3 mr-1" />
                    Connected
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3 w-3 mr-1" />
                    Disconnected
                  </>
                )}
              </Badge>
            </div>
          </div>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearChat}
              className="text-gray-400 hover:text-white hover:bg-[#2a2a2a] h-7 px-2"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </CardTitle>
        
        {connectionError && (
          <Alert variant="destructive" className="mt-2 bg-red-900/20 border-red-500/20">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              {connectionError}
              {retryCount < maxRetries && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={retryConnection}
                  className="ml-2 h-6 px-2 text-xs"
                >
                  Retry ({retryCount}/{maxRetries})
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0 bg-[#0f0f0f]">
        <ScrollArea className="flex-1 px-4 bg-[#0f0f0f]">
          <div className="space-y-4 pb-4 bg-[#0f0f0f]">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg p-3 ${
                  message.type === 'user'
                    ? 'bg-blue-600 text-white'
                    : message.type === 'system'
                    ? 'bg-[#0f0f0f] border border-[#2a2a2a] text-white'
                    : message.type === 'error'
                    ? 'bg-red-900/20 border border-red-500/20 text-red-300'
                    : 'bg-[#0f0f0f] text-white border border-[#2a2a2a]'
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
                              <CheckCircle className="h-3 w-3 text-green-400" />
                              <span className="text-xs text-gray-400">
                                Confidence: {message.metadata.confidence}%
                              </span>
                            </div>
                          )}
                          {message.metadata.error && (
                            <div className="flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 text-yellow-400" />
                              <span className="text-xs text-gray-400">
                                Error: {message.metadata.error}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Suggested Questions */}
        {messages.length <= 1 && isConnected && (
          <div className="px-4 py-2 border-t border-[#2a2a2a] bg-[#0f0f0f]">
            <p className="text-xs text-gray-400 mb-2">Suggested questions:</p>
            <div className="flex flex-col gap-1">
              {suggestedQuestions.slice(0, 3).map((question, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  className="justify-start h-auto py-2 px-2 text-xs text-gray-300 hover:bg-[#1a1a1a] hover:text-white bg-[#0f0f0f]"
                  onClick={() => handleSuggestedQuestion(question)}
                  disabled={isLoading || !isConnected}
                >
                  {question}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Context Info */}
        {context && isConnected && (
          <div className="px-4 py-2 border-t border-[#2a2a2a] bg-[#0f0f0f]">
            <div className="flex items-center gap-1 mb-1">
              <Info className="h-3 w-3 text-blue-400" />
              <span className="text-xs font-medium text-gray-400">Email Context Loaded</span>
            </div>
            <div className="text-xs text-gray-400 space-y-0.5">
              <div>From: {context.sender}</div>
              <div>To: {context.recipients?.join(', ') || 'N/A'}</div>
              <div>Subject: {context.subject}</div>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-[#2a2a2a] bg-[#0f0f0f]">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                !isConnected 
                  ? "Reconnecting..." 
                  : messageId 
                    ? "Ask about this email..." 
                    : "Ask about email security..."
              }
              disabled={isLoading || !isConnected}
              className="flex-1 bg-[#0f0f0f] border-[#2a2a2a] text-white placeholder:text-gray-400 focus:bg-[#0f0f0f] focus:border-[#2a2a2a]"
            />
            <Button 
              type="submit" 
              size="icon" 
              disabled={isLoading || !input.trim() || !isConnected}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <p className="text-xs text-gray-400 mt-1">
            {isConnected 
              ? "AI-powered email investigation assistant" 
              : "Connection required for AI analysis"
            }
          </p>
        </div>
      </CardContent>
    </Card>
  )
}