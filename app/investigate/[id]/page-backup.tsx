"use client"

// app/investigate/[id]/page-stream.tsx - Full-screen investigation with streaming
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, Send, Sparkles, AlertTriangle, Shield, Users, History, Bot, ChevronDown, ChevronRight, Terminal, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Types
interface Investigation {
  investigationId: string
  emailMessageId: string
  status: string
  priority: string
  severity: string
  description: string
  createdAt: string
}

interface EmailData {
  messageId: string
  subject: string
  sender: string
  recipients: string[]
  timestamp: string
  body: string
  htmlBody?: string
  headers?: Record<string, string>
  attachments?: any[]
}

interface ThinkingStep {
  step: number
  totalSteps: number
  action: string
  reasoning?: string
}

interface ToolCall {
  toolName: string
  args: any
  timestamp: number
}

interface ToolResult {
  toolName: string
  result: any
  success: boolean
  timestamp: number
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  isPipeline?: boolean
  isError?: boolean
  thinking?: {
    steps: ThinkingStep[]
    toolCalls: ToolCall[]
    toolResults: ToolResult[]
    expanded: boolean
  }
  duration?: number
  tokensUsed?: number
}

// Quick actions
const QUICK_ACTIONS = [
  { id: 'initialize', label: 'Initialize', icon: Sparkles, pipeline: 'initialize' },
  { id: 'whyFlagged', label: 'Why Flagged?', icon: AlertTriangle, pipeline: 'whyFlagged' },
  { id: 'whoElse', label: 'Who Else Got This?', icon: Users, pipeline: 'whoElse' },
  { id: 'senderRisk', label: 'Sender Risk', icon: Shield, pipeline: 'senderRisk' },
  { id: 'similarIncidents', label: 'Similar Past Incidents', icon: History, pipeline: 'similarIncidents' }
]

const SUGGESTED_QUESTIONS = [
  "What URLs are in this email?",
  "Has this sender sent suspicious emails before?",
  "Who are the recipients of this email?",
  "What's unusual about this email?",
  "Is this part of a larger campaign?"
]

export default function FullscreenInvestigationStreamPage() {
  const params = useParams()
  const emailId = params.id as string

  // Data state
  const [investigation, setInvestigation] = useState<Investigation | null>(null)
  const [emailData, setEmailData] = useState<EmailData | null>(null)
  const [loading, setLoading] = useState(true)

  // Chat state
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [currentThinking, setCurrentThinking] = useState<any>(null)
  const [selectedTab, setSelectedTab] = useState('overview')

  const chatEndRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Load data
  useEffect(() => {
    loadInvestigationData()
  }, [emailId])

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentThinking])

  async function loadInvestigationData() {
    try {
      setLoading(true)

      const invRes = await fetch(`/api/investigations?emailMessageId=${emailId}`)
      if (invRes.ok) {
        const investigations = await invRes.json()
        if (investigations.length > 0) {
          setInvestigation(investigations[0])
        }
      }

      const emailRes = await fetch(`/api/email/${emailId}`)
      if (emailRes.ok) {
        const email = await emailRes.json()
        setEmailData(email)
      }

      setLoading(false)
    } catch (error) {
      console.error('Failed to load investigation:', error)
      setLoading(false)
    }
  }

  async function startStreamingInvestigation(pipelineId?: string, customQuestion?: string) {
    if (streaming) return

    const userMessage: Message = {
      role: 'user',
      content: customQuestion || QUICK_ACTIONS.find(a => a.pipeline === pipelineId)?.label || 'Investigation',
      isPipeline: !!pipelineId
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setStreaming(true)
    setCurrentThinking({
      steps: [],
      toolCalls: [],
      toolResults: [],
      expanded: false
    })

    const startTime = Date.now()

    try {
      // Use fetch to POST, then read stream
      const response = await fetch('/api/agent/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailId,
          pipeline: pipelineId,
          question: customQuestion,
          messages: messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({
            role: m.role,
            content: m.content
          })),
          maxHops: 8
        })
      })

      if (!response.ok) {
        throw new Error(`Stream failed: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      let buffer = ''
      let finalAnswer = ''
      let totalTokens = 0

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue

          try {
            const event = JSON.parse(line.slice(6))

            switch (event.type) {
              case 'thinking':
                setCurrentThinking((prev: any) => ({
                  ...prev,
                  steps: [...(prev?.steps || []), event.data]
                }))
                break

              case 'tool_call':
                setCurrentThinking((prev: any) => ({
                  ...prev,
                  toolCalls: [...(prev?.toolCalls || []), event.data]
                }))
                break

              case 'tool_result':
                setCurrentThinking((prev: any) => ({
                  ...prev,
                  toolResults: [...(prev?.toolResults || []), event.data]
                }))
                break

              case 'answer':
                finalAnswer = event.data.content
                totalTokens = event.data.tokensUsed || 0
                break

              case 'done':
                // Finalize
                const duration = Date.now() - startTime
                setMessages(prev => [...prev, {
                  role: 'assistant',
                  content: finalAnswer || 'Investigation complete.',
                  thinking: currentThinking,
                  duration,
                  tokensUsed: totalTokens
                }])
                setCurrentThinking(null)
                setStreaming(false)
                break

              case 'error':
                throw new Error(event.data.message)
            }
          } catch (parseError) {
            console.error('Failed to parse SSE event:', parseError)
          }
        }
      }

    } catch (error: any) {
      console.error('Streaming error:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message}`,
        isError: true
      }])
      setCurrentThinking(null)
      setStreaming(false)
    }
  }

  function runPipeline(pipelineId: string) {
    startStreamingInvestigation(pipelineId)
  }

  function sendMessage() {
    if (!input.trim() || streaming) return
    startStreamingInvestigation(undefined, input)
  }

  function toggleThinking(index: number) {
    setMessages(prev => prev.map((msg, i) => {
      if (i === index && msg.thinking) {
        return {
          ...msg,
          thinking: {
            ...msg.thinking,
            expanded: !msg.thinking.expanded
          }
        }
      }
      return msg
    }))
  }

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-neutral-950">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-neutral-950 text-neutral-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-500" />
                Email Investigation
              </h1>
              <p className="text-sm text-neutral-400 mt-1">
                {emailData?.subject || 'No subject'} • {emailData?.sender || 'Unknown sender'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {investigation && (
                <>
                  <Badge variant="outline" className="text-xs">{investigation.status}</Badge>
                  <Badge variant="outline" className={`text-xs ${
                    investigation.priority === 'critical' ? 'border-red-500 text-red-500' :
                    investigation.priority === 'high' ? 'border-orange-500 text-orange-500' :
                    investigation.priority === 'medium' ? 'border-yellow-500 text-yellow-500' :
                    'border-neutral-500 text-neutral-500'
                  }`}>
                    {investigation.priority}
                  </Badge>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 grid grid-cols-12 gap-0 overflow-hidden">
        {/* Left Panel */}
        <div className="col-span-7 border-r border-neutral-800 flex flex-col overflow-hidden">
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex-1 flex flex-col">
            <div className="border-b border-neutral-800 px-6">
              <TabsList className="bg-transparent">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="content">Email Content</TabsTrigger>
                <TabsTrigger value="headers">Headers</TabsTrigger>
                <TabsTrigger value="attachments">Attachments</TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6">
                <TabsContent value="overview" className="mt-0">
                  <div className="space-y-4">
                    <Card className="bg-neutral-900 border-neutral-800">
                      <CardHeader>
                        <CardTitle className="text-sm">Email Metadata</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-neutral-400">From</p>
                            <p className="font-mono">{emailData?.sender || 'N/A'}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-neutral-400">To</p>
                            <p className="font-mono">{emailData?.recipients?.join(', ') || 'N/A'}</p>
                          </div>
                          <div className="col-span-3">
                            <p className="text-neutral-400">Subject</p>
                            <p>{emailData?.subject || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-neutral-400">Date</p>
                            <p>{emailData?.timestamp ? new Date(emailData.timestamp).toLocaleString() : 'N/A'}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {investigation && (
                      <Card className="bg-neutral-900 border-neutral-800">
                        <CardHeader>
                          <CardTitle className="text-sm">Investigation Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <div>
                            <p className="text-neutral-400">Description</p>
                            <p>{investigation.description || 'No description'}</p>
                          </div>
                          <div>
                            <p className="text-neutral-400">Created</p>
                            <p>{new Date(investigation.createdAt).toLocaleString()}</p>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="content" className="mt-0">
                  <Card className="bg-neutral-900 border-neutral-800">
                    <CardHeader>
                      <CardTitle className="text-sm">Email Body</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-sm whitespace-pre-wrap font-mono">
                        {emailData?.body || 'No content'}
                      </pre>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="headers" className="mt-0">
                  <Card className="bg-neutral-900 border-neutral-800">
                    <CardHeader>
                      <CardTitle className="text-sm">Email Headers</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs font-mono whitespace-pre-wrap">
                        {emailData?.headers ? JSON.stringify(emailData.headers, null, 2) : 'No headers'}
                      </pre>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="attachments" className="mt-0">
                  <Card className="bg-neutral-900 border-neutral-800">
                    <CardHeader>
                      <CardTitle className="text-sm">Attachments</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {emailData?.attachments && emailData.attachments.length > 0 ? (
                        <ul className="space-y-2">
                          {emailData.attachments.map((att: any, i: number) => (
                            <li key={i} className="text-sm">
                              {att.filename} ({att.size} bytes)
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-neutral-400">No attachments</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        </div>

        {/* Right Panel - AI Copilot */}
        <div className="col-span-5 flex flex-col bg-neutral-900/50">
          {/* Header */}
          <div className="border-b border-neutral-800 px-6 py-4">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-blue-500" />
              <h2 className="font-semibold">AI Investigation Assistant</h2>
              <Badge variant="outline" className="ml-auto text-xs">
                <Sparkles className="w-3 h-3 mr-1" />
                Streaming
              </Badge>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="border-b border-neutral-800 px-6 py-4">
            <p className="text-xs text-neutral-400 mb-3">Quick Actions</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_ACTIONS.map(action => {
                const Icon = action.icon
                return (
                  <Button
                    key={action.id}
                    size="sm"
                    variant="outline"
                    onClick={() => runPipeline(action.pipeline)}
                    disabled={streaming}
                    className="text-xs"
                  >
                    <Icon className="w-3 h-3 mr-1.5" />
                    {action.label}
                  </Button>
                )
              })}
            </div>
          </div>

          {/* Chat Messages */}
          <ScrollArea className="flex-1 px-6 py-4">
            {messages.length === 0 && !streaming ? (
              <div className="space-y-4">
                <div className="text-center py-8">
                  <Bot className="w-12 h-12 mx-auto text-neutral-600 mb-3" />
                  <p className="text-sm text-neutral-400 mb-2">
                    Start your investigation with a quick action or question.
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-neutral-500 font-medium">Suggested questions:</p>
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(q)}
                      className="block w-full text-left text-sm px-3 py-2 rounded-lg bg-neutral-800/50 hover:bg-neutral-800 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <div key={i} className={msg.role === 'user' ? 'ml-8' : 'mr-8'}>
                    {/* Message bubble */}
                    <div className={`rounded-lg p-3 ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : msg.isError
                        ? 'bg-red-900/20 border border-red-900/50 text-red-300'
                        : 'bg-neutral-800 text-neutral-100'
                    }`}>
                      {msg.isPipeline && (
                        <div className="flex items-center gap-2 mb-2 text-xs opacity-75">
                          <Sparkles className="w-3 h-3" />
                          Running pipeline...
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                      {msg.duration && (
                        <div className="mt-2 text-xs opacity-50">
                          {msg.duration}ms • {msg.tokensUsed || 0} tokens
                        </div>
                      )}
                    </div>

                    {/* Thinking section (collapsible) */}
                    {msg.thinking && (
                      <div className="mt-2">
                        <button
                          onClick={() => toggleThinking(i)}
                          className="flex items-center gap-2 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                        >
                          {msg.thinking.expanded ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                          <Terminal className="w-3 h-3" />
                          <span>
                            Thinking ({msg.thinking.steps.length} steps, {msg.thinking.toolCalls.length} tools)
                          </span>
                        </button>

                        {msg.thinking.expanded && (
                          <div className="mt-2 ml-5 space-y-2 text-xs">
                            {msg.thinking.steps.map((step: ThinkingStep, si: number) => (
                              <div key={si} className="flex items-start gap-2 text-neutral-400">
                                <Clock className="w-3 h-3 mt-0.5 shrink-0" />
                                <span>Step {step.step}/{step.totalSteps}: {step.action}</span>
                              </div>
                            ))}

                            {msg.thinking.toolCalls.map((call: ToolCall, ci: number) => {
                              const result = msg.thinking?.toolResults?.[ci]
                              return (
                                <div key={ci} className="pl-5 border-l-2 border-neutral-700">
                                  <div className="flex items-center gap-2 text-blue-400 font-mono">
                                    <Terminal className="w-3 h-3" />
                                    <span>{call.toolName}</span>
                                    {result && (
                                      result.success ? (
                                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                                      ) : (
                                        <XCircle className="w-3 h-3 text-red-500" />
                                      )
                                    )}
                                  </div>
                                  <pre className="mt-1 text-[10px] text-neutral-500 overflow-x-auto">
                                    {JSON.stringify(call.args, null, 2)}
                                  </pre>
                                  {result && (
                                    <div className="mt-1 text-neutral-500">
                                      → {result.success ? 'Success' : 'Failed'}
                                      {result.result?.rowCount && ` (${result.result.rowCount} rows)`}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Current streaming thinking */}
                {streaming && currentThinking && (
                  <div className="mr-8">
                    <div className="rounded-lg p-3 bg-neutral-800/50 border border-neutral-700">
                      <div className="flex items-center gap-2 text-sm text-neutral-300">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Thinking...</span>
                      </div>

                      <div className="mt-3 space-y-2 text-xs">
                        {currentThinking.steps.map((step: ThinkingStep, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-neutral-400">
                            <Clock className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>Step {step.step}: {step.action}</span>
                          </div>
                        ))}

                        {currentThinking.toolCalls.map((call: ToolCall, i: number) => {
                          const result = currentThinking.toolResults?.[i]
                          return (
                            <div key={i} className="pl-5 border-l-2 border-neutral-700">
                              <div className="flex items-center gap-2 text-blue-400 font-mono">
                                <Terminal className="w-3 h-3" />
                                <span>{call.toolName}</span>
                                {result && (
                                  result.success ? (
                                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                                  ) : (
                                    <XCircle className="w-3 h-3 text-red-500" />
                                  )
                                )}
                              </div>
                              {result && (
                                <div className="mt-1 text-neutral-500">
                                  → {result.success ? 'Success' : 'Failed'}
                                  {result.result?.rowCount && ` (${result.result.rowCount} rows)`}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <div className="border-t border-neutral-800 p-4">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder="Ask about this email..."
                className="min-h-[60px] max-h-[120px] bg-neutral-800 border-neutral-700 resize-none"
                disabled={streaming}
              />
              <Button
                onClick={sendMessage}
                disabled={streaming || !input.trim()}
                size="icon"
                className="shrink-0"
              >
                {streaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-neutral-500 mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
