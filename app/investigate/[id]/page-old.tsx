"use client"

// app/investigate/[id]/page.tsx - Full-screen investigation page with AI copilot
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, Send, Sparkles, AlertTriangle, Shield, Users, Search, History, Bot, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Investigation data types
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

interface ToolResult {
  tool: string
  args: any
  output: any
  timestamp: number
}

interface AgentResponse {
  success: boolean
  emailId: string
  pipeline: string
  answer: string
  trace: ToolResult[]
  tokensUsed?: number
  duration: number
}

// Quick action definitions
const QUICK_ACTIONS = [
  {
    id: 'initialize',
    label: 'Initialize',
    icon: Sparkles,
    description: 'Run comprehensive investigation',
    pipeline: 'initialize'
  },
  {
    id: 'whyFlagged',
    label: 'Why Flagged?',
    icon: AlertTriangle,
    description: 'Explain detection reasons',
    pipeline: 'whyFlagged'
  },
  {
    id: 'whoElse',
    label: 'Who Else Got This?',
    icon: Users,
    description: 'Analyze recipient patterns',
    pipeline: 'whoElse'
  },
  {
    id: 'senderRisk',
    label: 'Sender Risk',
    icon: Shield,
    description: 'Assess sender reputation',
    pipeline: 'senderRisk'
  },
  {
    id: 'similarIncidents',
    label: 'Similar Past Incidents',
    icon: History,
    description: 'Find related cases',
    pipeline: 'similarIncidents'
  }
]

// Suggested starter questions
const SUGGESTED_QUESTIONS = [
  "What URLs are in this email?",
  "Has this sender sent suspicious emails before?",
  "Who are the recipients of this email?",
  "What's unusual about this email?",
  "Is this part of a larger campaign?",
  "What's the sender's email history?"
]

export default function FullscreenInvestigationPage() {
  const params = useParams()
  const emailId = params.id as string

  // State
  const [investigation, setInvestigation] = useState<Investigation | null>(null)
  const [emailData, setEmailData] = useState<EmailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copilotLoading, setCopilotLoading] = useState(false)
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [trace, setTrace] = useState<ToolResult[]>([])
  const [selectedTab, setSelectedTab] = useState('overview')
  const [expandedQueries, setExpandedQueries] = useState<Set<number>>(new Set())

  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load investigation data
  useEffect(() => {
    loadInvestigationData()
  }, [emailId])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadInvestigationData() {
    try {
      setLoading(true)

      // Fetch investigation by email ID
      const invRes = await fetch(`/api/investigations?emailMessageId=${emailId}`)
      if (invRes.ok) {
        const investigations = await invRes.json()
        if (investigations.length > 0) {
          setInvestigation(investigations[0])
        }
      }

      // Fetch email data
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

  async function runPipeline(pipelineId: string) {
    setCopilotLoading(true)

    // Add user message
    const userMessage = {
      role: 'user',
      content: QUICK_ACTIONS.find(a => a.pipeline === pipelineId)?.label || pipelineId,
      isPipeline: true
    }
    setMessages(prev => [...prev, userMessage])

    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailId,
          pipeline: pipelineId,
          maxHops: 8
        })
      })

      const data: AgentResponse = await response.json()

      if (data.success) {
        // Add assistant response
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.answer,
          trace: data.trace,
          duration: data.duration,
          tokensUsed: data.tokensUsed
        }])

        // Update trace
        setTrace(data.trace)
      } else {
        throw new Error(data.error || 'Investigation failed')
      }
    } catch (error: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message}`,
        isError: true
      }])
    } finally {
      setCopilotLoading(false)
    }
  }

  async function sendMessage() {
    if (!input.trim() || copilotLoading) return

    const userMessage = {
      role: 'user',
      content: input
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setCopilotLoading(true)

    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailId,
          question: input,
          messages: messages,
          maxHops: 8
        })
      })

      const data: AgentResponse = await response.json()

      if (data.success) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.answer,
          trace: data.trace,
          duration: data.duration,
          tokensUsed: data.tokensUsed
        }])

        setTrace(data.trace)
      } else {
        throw new Error(data.error || 'Investigation failed')
      }
    } catch (error: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message}`,
        isError: true
      }])
    } finally {
      setCopilotLoading(false)
    }
  }

  function toggleQueryExpansion(index: number) {
    setExpandedQueries(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
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
                  <Badge variant="outline" className="text-xs">
                    {investigation.status}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      investigation.priority === 'critical' ? 'border-red-500 text-red-500' :
                      investigation.priority === 'high' ? 'border-orange-500 text-orange-500' :
                      investigation.priority === 'medium' ? 'border-yellow-500 text-yellow-500' :
                      'border-neutral-500 text-neutral-500'
                    }`}
                  >
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
        {/* Left Panel - Email Data & Analysis */}
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
                          <div>
                            <p className="text-neutral-400">Message ID</p>
                            <p className="font-mono text-xs truncate">{emailData?.messageId || 'N/A'}</p>
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
                            <p>{investigation.description || 'No description provided'}</p>
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
                        {emailData?.body || 'No content available'}
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
                        {emailData?.headers ? JSON.stringify(emailData.headers, null, 2) : 'No headers available'}
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
          {/* Copilot Header */}
          <div className="border-b border-neutral-800 px-6 py-4">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-blue-500" />
              <h2 className="font-semibold">AI Investigation Assistant</h2>
              <Badge variant="outline" className="ml-auto text-xs">
                <Sparkles className="w-3 h-3 mr-1" />
                GPT-4
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
                    disabled={copilotLoading}
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
            {messages.length === 0 ? (
              <div className="space-y-4">
                <div className="text-center py-8">
                  <Bot className="w-12 h-12 mx-auto text-neutral-600 mb-3" />
                  <p className="text-sm text-neutral-400 mb-2">
                    Start your investigation with a quick action above or ask a question below.
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-neutral-500 font-medium">Suggested questions:</p>
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(q)}
                      className="block w-full text-left text-sm px-3 py-2 rounded-lg bg-neutral-800/50 hover:bg-neutral-800 transition-colors text-neutral-300"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`${
                      msg.role === 'user'
                        ? 'ml-8'
                        : 'mr-8'
                    }`}
                  >
                    <div
                      className={`rounded-lg p-3 ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : msg.isError
                          ? 'bg-red-900/20 border border-red-900/50 text-red-300'
                          : 'bg-neutral-800 text-neutral-100'
                      }`}
                    >
                      {msg.isPipeline && (
                        <div className="flex items-center gap-2 mb-2 text-xs opacity-75">
                          <Sparkles className="w-3 h-3" />
                          Running pipeline...
                        </div>
                      )}
                      <div className="prose prose-invert prose-sm max-w-none">
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                      {msg.duration && (
                        <div className="mt-2 text-xs opacity-50">
                          {msg.duration}ms • {msg.tokensUsed || 0} tokens
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {copilotLoading && (
                  <div className="flex items-center gap-2 text-neutral-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Investigating...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Evidence Panel (shown when trace exists) */}
          {trace.length > 0 && (
            <div className="border-t border-neutral-800 px-6 py-3 max-h-48 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-neutral-400">Query Log ({trace.length})</p>
              </div>
              <div className="space-y-1">
                {trace.map((t, i) => (
                  <div key={i} className="text-xs">
                    <button
                      onClick={() => toggleQueryExpansion(i)}
                      className="w-full flex items-center justify-between p-2 rounded bg-neutral-800/50 hover:bg-neutral-800 transition-colors"
                    >
                      <span className="font-mono">{t.tool}</span>
                      {expandedQueries.has(i) ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                    {expandedQueries.has(i) && (
                      <pre className="mt-1 p-2 bg-neutral-950 rounded text-[10px] overflow-x-auto">
                        {JSON.stringify({ args: t.args, output: t.output }, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-neutral-800 p-4">
            <div className="flex gap-2">
              <Textarea
                ref={textareaRef}
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
                disabled={copilotLoading}
              />
              <Button
                onClick={sendMessage}
                disabled={copilotLoading || !input.trim()}
                size="icon"
                className="shrink-0"
              >
                {copilotLoading ? (
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
