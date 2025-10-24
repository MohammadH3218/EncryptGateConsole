"use client"

// app/investigate/[id]/page.tsx - Enhanced full-screen investigation
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, Send, Sparkles, AlertTriangle, Shield, Users, History, Bot, ChevronDown, ChevronRight, Terminal, CheckCircle2, XCircle, Clock, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmailPreviewDialog } from '@/components/email-preview-dialog'
import { formatMarkdown, formatSecurityContent, getEmailReferencesData } from '@/lib/copilot-formatting'

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
  { id: 'initialize', label: 'Initialize', icon: Sparkles, pipeline: 'initialize', description: 'Comprehensive multi-step investigation' },
  { id: 'whyFlagged', label: 'Why Flagged?', icon: AlertTriangle, pipeline: 'whyFlagged', description: 'Explain detection reasons' },
  { id: 'whoElse', label: 'Who Else?', icon: Users, pipeline: 'whoElse', description: 'Analyze recipient patterns' },
  { id: 'senderRisk', label: 'Sender Risk', icon: Shield, pipeline: 'senderRisk', description: 'Assess sender reputation' },
  { id: 'similarIncidents', label: 'Similar Incidents', icon: History, pipeline: 'similarIncidents', description: 'Find related cases' }
]

const SUGGESTED_QUESTIONS = [
  "What URLs are in this email?",
  "Has this sender sent suspicious emails before?",
  "Analyze the recipient list",
  "What's unusual about this email?",
  "Is this part of a larger campaign?",
  "Calculate risk score for this email"
]

export default function EnhancedInvestigationPage() {
  const params = useParams()
  const router = useRouter()
  const emailId = decodeURIComponent(params.id as string)

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

  // Email preview state
  const [previewEmailId, setPreviewEmailId] = useState<string | null>(null)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

      if (!reader) throw new Error('No response body')

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

  function handleEmailClick(emailId: string) {
    setPreviewEmailId(emailId)
    setPreviewDialogOpen(true)
  }

  function handleEmailRightClick(emailId: string, event: React.MouseEvent) {
    event.preventDefault()
    setInput(`Investigate email: ${emailId}`)
    textareaRef.current?.focus()
  }

    function renderFormattedContent(content: string) {
    const { hasReferences, textParts } = getEmailReferencesData(content)

    const renderSegment = (segment: string, key: string) => {
      const formatted = formatSecurityContent(formatMarkdown(segment))
      return (
        <span
          key={key}
          dangerouslySetInnerHTML={{ __html: formatted }}
        />
      )
    }

    if (!hasReferences) {
      return (
        <div
          className="prose prose-invert prose-sm max-w-none leading-relaxed"
          dangerouslySetInnerHTML={{
            __html: formatSecurityContent(formatMarkdown(content)),
          }}
        />
      )
    }

    return (
      <div className="prose prose-invert prose-sm max-w-none leading-relaxed flex flex-wrap items-start gap-1">
        {textParts.map((part) => {
          if (part.type === "text") {
            return renderSegment(part.content, `text-${part.index}`)
          }

          const ref = part.reference!
          const display =
            ref.emailId.length > 36
              ? `${ref.emailId.slice(0, 32)}…`
              : ref.emailId

          return (
            <button
              key={`email-ref-${part.index}`}
              onClick={() => handleEmailClick(ref.emailId)}
              onContextMenu={(e) => handleEmailRightClick(ref.emailId, e)}
              className="inline-flex items-center gap-1 rounded-md border border-app-ring/60 bg-app-accent/15 px-2 py-1 font-mono text-[11px] text-app-accent transition-all hover:bg-app-accent/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/50"
              title="Left click to preview • Right click to reference in chat"
            >
              <Mail className="h-3 w-3" />
              {display}
            </button>
          )
        })}
      </div>
    )
  }if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-neutral-950">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-neutral-400">Loading investigation...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-neutral-950 text-neutral-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-neutral-800 bg-gradient-to-r from-neutral-900 via-neutral-900/95 to-neutral-900/90 backdrop-blur-sm shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-xl font-semibold flex items-center gap-2 mb-1">
                <Shield className="w-5 h-5 text-blue-500" />
                Email Security Investigation
              </h1>
              <div className="flex items-center gap-4 text-sm">
                <p className="text-neutral-400 flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  <span className="font-semibold">{emailData?.subject || 'No subject'}</span>
                </p>
                <p className="text-neutral-500">â€¢</p>
                <p className="text-neutral-400 font-mono text-xs">{emailData?.sender || 'Unknown sender'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {investigation && (
                <>
                  <Badge variant="outline" className="text-xs capitalize">{investigation.status}</Badge>
                  <Badge variant="outline" className={`text-xs capitalize ${
                    investigation.priority === 'critical' ? 'border-red-500 text-red-400' :
                    investigation.priority === 'high' ? 'border-orange-500 text-orange-400' :
                    investigation.priority === 'medium' ? 'border-yellow-500 text-yellow-400' :
                    'border-green-500 text-green-400'
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
        {/* Left Panel - Email Data */}
        <div className="col-span-7 border-r border-neutral-800 flex flex-col overflow-hidden bg-neutral-950">
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex-1 flex flex-col">
            <div className="border-b border-neutral-800 px-6 py-3 bg-neutral-900/50">
              <TabsList className="bg-neutral-800/50">
                <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                <TabsTrigger value="content" className="text-xs">Content</TabsTrigger>
                <TabsTrigger value="headers" className="text-xs">Headers</TabsTrigger>
                <TabsTrigger value="attachments" className="text-xs">
                  Attachments {emailData?.attachments?.length ? `(${emailData.attachments.length})` : ''}
                </TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6">
                <TabsContent value="overview" className="mt-0">
                  <div className="space-y-4">
                    <Card className="bg-neutral-900/50 border-neutral-800 shadow-lg">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-neutral-300">Email Metadata</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-neutral-500 text-xs font-medium mb-1">From</p>
                            <p className="font-mono text-neutral-200 text-xs">{emailData?.sender || 'N/A'}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-neutral-500 text-xs font-medium mb-1">To</p>
                            <p className="font-mono text-neutral-200 text-xs truncate">{emailData?.recipients?.join(', ') || 'N/A'}</p>
                          </div>
                          <div className="col-span-3">
                            <p className="text-neutral-500 text-xs font-medium mb-1">Subject</p>
                            <p className="text-neutral-200 text-sm">{emailData?.subject || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-neutral-500 text-xs font-medium mb-1">Date</p>
                            <p className="text-neutral-200 text-xs">{emailData?.timestamp ? new Date(emailData.timestamp).toLocaleString() : 'N/A'}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-neutral-500 text-xs font-medium mb-1">Message ID</p>
                            <p className="font-mono text-neutral-400 text-[10px] truncate">{emailData?.messageId || 'N/A'}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {investigation && (
                      <Card className="bg-neutral-900/50 border-neutral-800 shadow-lg">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium text-neutral-300">Investigation Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <div>
                            <p className="text-neutral-500 text-xs font-medium mb-1">Description</p>
                            <p className="text-neutral-300 text-xs">{investigation.description || 'No description'}</p>
                          </div>
                          <div>
                            <p className="text-neutral-500 text-xs font-medium mb-1">Created</p>
                            <p className="text-neutral-300 text-xs">{new Date(investigation.createdAt).toLocaleString()}</p>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="content" className="mt-0">
                  <Card className="bg-neutral-900/50 border-neutral-800 shadow-lg">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-neutral-300">Email Body</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-sm whitespace-pre-wrap font-mono text-neutral-300 bg-neutral-950 p-4 rounded-lg">
                        {emailData?.body || 'No content'}
                      </pre>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="headers" className="mt-0">
                  <Card className="bg-neutral-900/50 border-neutral-800 shadow-lg">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-neutral-300">Email Headers</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs font-mono whitespace-pre-wrap text-neutral-400 bg-neutral-950 p-4 rounded-lg overflow-x-auto">
                        {emailData?.headers ? JSON.stringify(emailData.headers, null, 2) : 'No headers'}
                      </pre>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="attachments" className="mt-0">
                  <Card className="bg-neutral-900/50 border-neutral-800 shadow-lg">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-neutral-300">Attachments</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {emailData?.attachments && emailData.attachments.length > 0 ? (
                        <ul className="space-y-2">
                          {emailData.attachments.map((att: any, i: number) => (
                            <li key={i} className="text-sm bg-neutral-950 p-3 rounded-lg flex items-center justify-between">
                              <span className="text-neutral-200">{att.filename}</span>
                              <span className="text-neutral-500 text-xs">{att.size ? `${(att.size / 1024).toFixed(2)} KB` : 'Unknown size'}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-neutral-500">No attachments</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        </div>

        {/* Right Panel - AI Copilot */}
        <div className="col-span-5 flex flex-col bg-gradient-to-b from-neutral-900/50 to-neutral-950">
          {/* Copilot Header */}
          <div className="border-b border-neutral-800 px-6 py-4 bg-neutral-900/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-blue-500" />
                <h2 className="font-semibold">AI Investigation Assistant</h2>
              </div>
              <Badge variant="outline" className="text-xs bg-blue-600/10 border-blue-500/50">
                <Sparkles className="w-3 h-3 mr-1" />
                Streaming
              </Badge>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="border-b border-neutral-800 px-6 py-4 bg-neutral-900/30">
            <p className="text-xs text-neutral-400 mb-3 font-medium">Quick Actions</p>
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
                    className="text-xs hover:bg-blue-600/10 hover:border-blue-500/50"
                    title={action.description}
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
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-600/10 flex items-center justify-center">
                    <Bot className="w-8 h-8 text-blue-500" />
                  </div>
                  <p className="text-sm text-neutral-300 mb-2 font-medium">
                    Ready to investigate this email
                  </p>
                  <p className="text-xs text-neutral-500">
                    Choose a quick action above or ask a custom question
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-neutral-500 font-medium">Suggested questions:</p>
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(q)}
                      className="block w-full text-left text-sm px-4 py-2.5 rounded-lg bg-neutral-800/50 hover:bg-neutral-800 transition-all text-neutral-300 hover:text-neutral-100 border border-neutral-700/50 hover:border-neutral-600"
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
                    <div className={`rounded-lg p-4 shadow-md ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white'
                        : msg.isError
                        ? 'bg-red-900/20 border border-red-900/50 text-red-300'
                        : 'bg-neutral-800/70 text-neutral-100 border border-neutral-700/50'
                    }`}>
                      {msg.isPipeline && (
                        <div className="flex items-center gap-2 mb-3 text-xs opacity-90">
                          <Sparkles className="w-3 h-3" />
                          <span>Running automated workflow...</span>
                        </div>
                      )}
                      <div className="text-[13px] leading-relaxed">
                        {renderFormattedContent(msg.content)}
                      </div>
                      {msg.duration && (
                        <div className="mt-3 pt-3 border-t border-neutral-700/50 text-[10px] text-neutral-400 flex items-center gap-3">
                          <span>{msg.duration}ms</span>
                          <span>â€¢</span>
                          <span>{msg.tokensUsed || 0} tokens</span>
                        </div>
                      )}
                    </div>

                    {/* Thinking section */}
                    {msg.thinking && (
                      <div className="mt-2">
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
                            Thinking ({msg.thinking.steps.length} steps, {msg.thinking.toolCalls.length} queries)
                          </span>
                        </button>

                        {msg.thinking.expanded && (
                          <div className="mt-3 ml-6 space-y-2 text-xs bg-neutral-900/50 rounded-lg p-3 border border-neutral-800">
                            {msg.thinking.steps.map((step: ThinkingStep, si: number) => (
                              <div key={si} className="flex items-start gap-2 text-neutral-400">
                                <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500" />
                                <span><span className="text-neutral-500">Step {step.step}:</span> {step.action}</span>
                              </div>
                            ))}

                            {msg.thinking.toolCalls.map((call: ToolCall, ci: number) => {
                              const result = msg.thinking?.toolResults?.[ci]
                              return (
                                <div key={ci} className="pl-5 border-l-2 border-neutral-700/50 ml-1">
                                  <div className="flex items-center gap-2 font-mono text-blue-400 mb-1">
                                    <Terminal className="w-3 h-3" />
                                    <span className="text-xs">{call.toolName}</span>
                                    {result && (
                                      result.success ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                      ) : (
                                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                                      )
                                    )}
                                  </div>
                                  <pre className="mt-1 text-[10px] text-neutral-500 overflow-x-auto bg-neutral-950 p-2 rounded">
                                    {JSON.stringify(call.args, null, 2)}
                                  </pre>
                                  {result && (
                                    <div className="mt-1.5 text-neutral-500 text-xs">
                                      â†’ {result.success ? <span className="text-green-500">Success</span> : <span className="text-red-500">Failed</span>}
                                      {result.result?.rowCount && <span className="ml-1">({result.result.rowCount} rows)</span>}
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
                    <div className="rounded-lg p-4 bg-neutral-800/50 border border-neutral-700 shadow-md">
                      <div className="flex items-center gap-2 text-sm text-neutral-300 mb-3">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        <span className="font-medium">Thinking...</span>
                      </div>

                      <div className="space-y-2 text-xs">
                        {currentThinking.steps.map((step: ThinkingStep, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-neutral-400">
                            <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500" />
                            <span>Step {step.step}: {step.action}</span>
                          </div>
                        ))}

                        {currentThinking.toolCalls.map((call: ToolCall, i: number) => {
                          const result = currentThinking.toolResults?.[i]
                          return (
                            <div key={i} className="pl-5 border-l-2 border-neutral-700/50 ml-1">
                              <div className="flex items-center gap-2 font-mono text-blue-400">
                                <Terminal className="w-3 h-3" />
                                <span className="text-xs">{call.toolName}</span>
                                {result && (
                                  result.success ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                  ) : (
                                    <XCircle className="w-3.5 h-3.5 text-red-500" />
                                  )
                                )}
                              </div>
                              {result && (
                                <div className="mt-1 text-neutral-500 text-xs">
                                  â†’ {result.success ? <span className="text-green-500">Success</span> : <span className="text-red-500">Failed</span>}
                                  {result.result?.rowCount && <span className="ml-1">({result.result.rowCount} rows)</span>}
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
          <div className="border-t border-neutral-800 p-4 bg-neutral-900/30">
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
                className="min-h-[60px] max-h-[120px] bg-neutral-800 border-neutral-700 resize-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                disabled={streaming}
              />
              <Button
                onClick={sendMessage}
                disabled={streaming || !input.trim()}
                size="icon"
                className="shrink-0 bg-blue-600 hover:bg-blue-700 h-[60px] w-[60px]"
              >
                {streaming ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-neutral-500 mt-2">
              Press <kbd className="px-1 py-0.5 bg-neutral-800 rounded text-neutral-400">Enter</kbd> to send â€¢ <kbd className="px-1 py-0.5 bg-neutral-800 rounded text-neutral-400">Shift+Enter</kbd> for new line
            </p>
          </div>
        </div>
      </div>

      {/* Email Preview Dialog */}
      <EmailPreviewDialog
        emailId={previewEmailId}
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        onInvestigate={(id) => {
          window.open(`/investigate/${encodeURIComponent(id)}`, '_blank')
        }}
      />
    </div>
  )
}


