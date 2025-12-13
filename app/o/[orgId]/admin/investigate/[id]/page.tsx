"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { AlertTriangle, ArrowLeft, Ban, CheckCircle, Loader2, Send, Shield, RefreshCw, Bot, User, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { InvestigationCanvas } from "@/components/investigation-workspace/InvestigationCanvas"
import type { EmailDetails, InvestigationSummary } from "@/components/investigation-workspace/types"

const GRAPH_TRIGGERS = ["sender", "recipient", "emails", "campaign", "graph", "relationship"]

interface Message {
  role: "user" | "assistant"
  content: string
  timestamp: Date
  collapsed?: boolean
  error?: boolean
}

export default function AdminInvestigatePage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string
  // Next.js route params are automatically decoded, but sometimes they come encoded
  // Get the raw id - it should already be decoded by Next.js
  const rawId = params.id as string
  // Try to decode if it looks encoded (contains %), otherwise use as-is
  let emailId: string
  try {
    emailId = rawId.includes('%') ? decodeURIComponent(rawId) : rawId
  } catch {
    emailId = rawId
  }

  const [investigation, setInvestigation] = useState<InvestigationSummary | null>(null)
  const [emailData, setEmailData] = useState<EmailDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showGraph, setShowGraph] = useState(false)
  const [activeQuery, setActiveQuery] = useState<string | null>(null)

  // AI Assistant state
  const [messages, setMessages] = useState<Message[]>([])
  const [assistantInput, setAssistantInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean
    checking: boolean
    neo4j?: boolean
    error?: string
  }>({ connected: false, checking: true })
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  // Check Neo4j connection status
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch('/api/test-neo4j-connection')
        const data = await response.json()
        setConnectionStatus({
          connected: data.success === true,
          checking: false,
          neo4j: data.neo4j?.connected,
          error: data.success ? undefined : (data.error || data.message)
        })
      } catch (error) {
        setConnectionStatus({
          connected: false,
          checking: false,
          error: error instanceof Error ? error.message : 'Connection check failed'
        })
      }
    }

    checkConnection()
    const interval = setInterval(checkConnection, 30000) // Check every 30 seconds
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    loadData()
  }, [emailId])

  const handleAssistantQuery = (query: string) => {
    setActiveQuery(query)
    const shouldShowGraph = GRAPH_TRIGGERS.some((trigger) => query.toLowerCase().includes(trigger))
    if (shouldShowGraph) {
      setShowGraph(true)
    }
    // Also send to chat
    sendToAssistant(query)
  }

  const sendToAssistant = async (prompt: string) => {
    if (!prompt.trim() || !emailId) return

    const userMessage: Message = { role: "user", content: prompt.trim(), timestamp: new Date() }
    setMessages((prev) => [...prev, userMessage])
    setIsTyping(true)

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
      setAssistantInput("")
    }
  }

  async function loadData() {
    try {
      setLoading(true)
      setError(null)

      console.log("📧 [Investigate Page] Loading data for emailId:", emailId)
      console.log("📧 [Investigate Page] Raw params.id:", params.id)
      console.log("📧 [Investigate Page] OrgId:", orgId)

      try {
        const invRes = await fetch(`/api/investigations?emailMessageId=${encodeURIComponent(emailId)}`)
        if (invRes.ok) {
          const investigations = await invRes.json()
          if (Array.isArray(investigations) && investigations.length > 0) {
            setInvestigation(investigations[0])
          }
        }
      } catch (e) {
        console.warn("Failed to load investigation:", e)
      }

      // For the API call, we need to properly encode the messageId
      // Since emailId is already decoded, we encode it once for the URL
      const apiMessageId = encodeURIComponent(emailId)
      console.log("📧 [Investigate Page] Decoded emailId:", emailId)
      console.log("📧 [Investigate Page] Encoded for API:", apiMessageId)
      console.log("📧 [Investigate Page] API URL will be: /api/email/" + apiMessageId.substring(0, 50) + "...")
      const emailRes = await fetch(`/api/email/${apiMessageId}`)
      const rawBody = await emailRes.text()

      let parsed: any = null
      try {
        parsed = rawBody ? JSON.parse(rawBody) : null
      } catch (err) {
        console.error("Email API returned non-JSON response:", rawBody)
        setError("Email service returned an unexpected response. Please retry.")
        return
      }

      if (emailRes.ok) {
        const email = parsed?.email || parsed
        if (email && email.messageId) {
          setEmailData(email as EmailDetails)
        } else {
          setError("Invalid email data format")
        }
      } else {
        setError(parsed?.error || "Failed to load email")
      }
    } catch (err: any) {
      setError(err.message || "Failed to load investigation data")
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmitAction(action: "block" | "allow" | "push") {
    if (!emailData?.messageId) return

    setSubmitting(true)
    try {
      let response

      if (action === "block") {
        response = await fetch(`/api/email/block`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-org-id": orgId },
          body: JSON.stringify({
            messageId: emailData.messageId,
            sender: emailData.sender,
            orgId: orgId,
            reason: "Blocked from investigation",
          }),
        })
      } else if (action === "allow") {
        response = await fetch(`/api/email/allow`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-org-id": orgId },
          body: JSON.stringify({
            messageId: emailData.messageId,
            orgId: orgId,
            reason: "Allowed from investigation",
          }),
        })
      } else if (action === "push") {
        response = await fetch(`/api/admin/pushed-requests`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-org-id": orgId },
          body: JSON.stringify({
            emailMessageId: emailData.messageId,
            investigationId: investigation?.investigationId,
            orgId: orgId,
            reason: "Pushed from investigation",
            priority: investigation?.priority || "medium",
          }),
        })
      }

      if (response && response.ok) {
        setSubmitDialogOpen(false)
        setTimeout(() => window.location.reload(), 800)
      } else {
        throw new Error(`Failed to ${action} email`)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
          <p className="text-white font-medium mb-2">Loading investigation...</p>
          <p className="text-gray-400 text-sm">Retrieving email data and security analysis</p>
        </div>
      </div>
    )
  }

  if (error || !emailData) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-600/10 border border-red-600/20 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Unable to Load Email Data</h2>
          <p className="text-gray-400 text-sm mb-4">
            {error || "The requested email could not be found. If this keeps happening, retry or contact an admin."}
          </p>
          <div className="bg-[#1f1f1f] border border-white/10 rounded-lg p-3 mb-4">
            <p className="text-xs text-gray-400 font-mono break-all">{emailId}</p>
          </div>
          <Button
            onClick={() => router.back()}
            variant="outline"
            className="bg-[#1f1f1f] border-white/10 text-white hover:bg-[#2a2a2a]"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      {/* Top Navigation Bar */}
      <div className="border-b border-white/10 bg-[#0f0f0f] sticky top-0 z-50">
        <div className="px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Button
              onClick={() => router.back()}
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-white hover:bg-[#2a2a2a]"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Investigation
            </h1>
          </div>
          <Button
            onClick={() => setSubmitDialogOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Send className="w-4 h-4 mr-2" />
            Submit Investigation
          </Button>
        </div>
      </div>

      {/* Main Content - Split View */}
      <div className="flex h-[calc(100vh-57px)]">
        {/* Investigation Content - Left Side */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {/* Email Information Card */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Email Details */}
            <div className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300 rounded-lg border border-white/10 p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />
                Email Information
              </h3>
              <div className="space-y-2.5">
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Subject</label>
                  <p className="text-sm text-white mt-1 break-words">{emailData.subject || 'No Subject'}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">From</label>
                  <p className="text-sm text-white mt-1 font-mono break-all">{emailData.sender}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">To</label>
                  <div className="mt-1">
                    {Array.isArray(emailData.recipients) && emailData.recipients.length > 0 ? (
                      <div className="space-y-1">
                        {emailData.recipients.map((recipient, index) => (
                          <p key={index} className="text-sm text-white font-mono break-all">{recipient}</p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No recipients</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Received</label>
                  <p className="text-sm text-white mt-1">
                    {new Date(emailData.timestamp).toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Direction</label>
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${
                      emailData.direction === 'inbound'
                        ? 'bg-blue-900/30 text-blue-300 border border-blue-600/30'
                        : 'bg-gray-800/50 text-gray-300 border border-gray-600/50'
                    }`}>
                      {emailData.direction?.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Status & Security */}
            <div className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300 rounded-lg border border-white/10 p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />
                Status & Security
              </h3>
              <div className="space-y-2.5">
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Investigation Status</label>
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${
                      emailData.investigationStatus === 'new'
                        ? 'bg-red-600 text-white'
                        : emailData.investigationStatus === 'in_progress'
                        ? 'bg-yellow-600 text-white'
                        : 'bg-green-600/30 text-green-400 border border-green-500/30'
                    }`}>
                      {emailData.investigationStatus?.toUpperCase().replace('_', ' ') || 'NEW'}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Flagged Status</label>
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${
                      emailData.flaggedCategory === 'manual'
                        ? 'bg-orange-600 text-white'
                        : emailData.flaggedCategory === 'ai'
                        ? 'bg-purple-600 text-white'
                        : emailData.flaggedCategory === 'clean'
                        ? 'bg-green-600/30 text-green-400 border border-green-500/30'
                        : 'bg-gray-600/30 text-gray-400 border border-gray-500/30'
                    }`}>
                      {emailData.flaggedCategory?.toUpperCase() || 'NONE'}
                      {emailData.flaggedSeverity && ` (${emailData.flaggedSeverity.toUpperCase()})`}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Email Status</label>
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${
                      emailData.status === 'quarantined' || emailData.status === 'blocked'
                        ? 'bg-red-600 text-white'
                        : emailData.status === 'analyzed'
                        ? 'bg-gray-600/30 text-gray-400 border border-gray-500/30'
                        : 'bg-gray-700/30 text-gray-400 border border-gray-600/30'
                    }`}>
                      {emailData.status?.toUpperCase() || 'RECEIVED'}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Size</label>
                  <p className="text-sm text-white mt-1">
                    {emailData.size ? (emailData.size / 1024).toFixed(1) : '0.0'} KB
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Message ID</label>
                  <p className="text-xs text-gray-400 font-mono break-all mt-1">{emailData.messageId}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Investigation Analysis */}
          <InvestigationCanvas
            email={emailData}
            investigation={investigation}
            showGraph={showGraph}
            onCloseGraph={() => setShowGraph(false)}
            activeQuery={activeQuery}
          />
        </div>

        {/* AI Assistant - Right Side */}
        <div className="w-[400px] border-l border-white/10 bg-[#0f0f0f] flex flex-col">
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-white">Investigation Assistant</h2>
                <div className="flex items-center gap-1">
                  {connectionStatus.checking ? (
                    <>
                      <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                      <span className="text-xs text-gray-400">Checking...</span>
                    </>
                  ) : connectionStatus.connected ? (
                    <>
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-xs text-green-400">Connected</span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-xs text-red-400" title={connectionStatus.error}>
                        Disconnected
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            {!connectionStatus.connected && !connectionStatus.checking && (
              <div className="mt-2 p-2 rounded-lg bg-red-900/20 border border-red-600/30">
                <p className="text-xs text-red-400">
                  Neo4j connection failed. Check console for details.
                </p>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="p-4 border-b border-white/10">
            <p className="text-xs text-gray-400 font-medium mb-3">Quick Actions</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs bg-[#1f1f1f] border-white/10 text-white hover:bg-[#2a2a2a] h-auto py-2"
                onClick={() => handleAssistantQuery("Why was this flagged?")}
                disabled={isTyping}
              >
                Why Flagged?
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs bg-[#1f1f1f] border-white/10 text-white hover:bg-[#2a2a2a] h-auto py-2"
                onClick={() => handleAssistantQuery("Analyze sender risk")}
                disabled={isTyping}
              >
                Sender Risk
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs bg-[#1f1f1f] border-white/10 text-white hover:bg-[#2a2a2a] h-auto py-2"
                onClick={() => handleAssistantQuery("Check URLs in email")}
                disabled={isTyping}
              >
                URL Analysis
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs bg-[#1f1f1f] border-white/10 text-white hover:bg-[#2a2a2a] h-auto py-2"
                onClick={() => handleAssistantQuery("Find similar incidents")}
                disabled={isTyping}
              >
                Similar Incidents
              </Button>
            </div>
          </div>

          {/* Chat Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <Bot className="w-12 h-12 text-gray-600 mx-auto mb-3 opacity-50" />
                <p className="text-sm font-medium text-white mb-1">Start Your Investigation</p>
                <p className="text-xs text-gray-400 max-w-[220px] mx-auto">
                  Ask about senders, campaigns, relationships, anomalies, and security signals.
                </p>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div key={index} className="space-y-2">
                  {msg.role === "user" ? (
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#2a2a2a] flex items-center justify-center shrink-0">
                        <User className="w-3 h-3 text-gray-400" />
                      </div>
                      <p className="text-sm text-white pt-0.5">{msg.content}</p>
                    </div>
                  ) : (
                    <div className="ml-8 bg-[#1f1f1f] rounded-lg border border-white/10 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-3 h-3 text-blue-400" />
                        <span className="text-xs font-medium text-white">
                          {msg.error ? "Assistant (error)" : "Investigation Note"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  )}
                </div>
              ))
            )}

            {isTyping && (
              <div className="flex items-center gap-2 ml-8">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-xs text-gray-400">Analyzing...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-white/10">
            <div className="flex gap-2">
              <input
                type="text"
                value={assistantInput}
                onChange={(e) => setAssistantInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendToAssistant(assistantInput)
                }}
                placeholder={emailId ? "Ask about this investigation..." : "Waiting for email data..."}
                className="flex-1 bg-[#1f1f1f] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                disabled={!emailId || isTyping}
              />
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => sendToAssistant(assistantInput)}
                disabled={!assistantInput.trim() || isTyping || !emailId}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Submit Investigation Dialog */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="bg-[#0f0f0f] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">Submit Investigation</DialogTitle>
            <DialogDescription className="text-gray-400">
              Choose an action for this email investigation
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            <Button
              onClick={() => handleSubmitAction("block")}
              disabled={submitting}
              className="w-full justify-start hover:bg-red-900/10 text-red-300 border border-red-600/30 h-auto py-4 bg-transparent shadow-none"
            >
              <Ban className="w-5 h-5 mr-3" />
              <div className="flex-1 text-left">
                <div className="font-semibold">Block Email</div>
                <div className="text-xs text-red-400/80 mt-1">Block this email and sender from future delivery</div>
              </div>
            </Button>

            <Button
              onClick={() => handleSubmitAction("allow")}
              disabled={submitting}
              className="w-full justify-start hover:bg-green-900/10 text-green-300 border border-green-600/30 h-auto py-4 bg-transparent shadow-none"
            >
              <CheckCircle className="w-5 h-5 mr-3" />
              <div className="flex-1 text-left">
                <div className="font-semibold">Allow Email</div>
                <div className="text-xs text-green-400/80 mt-1">Mark this email as safe</div>
              </div>
            </Button>

            <Button
              onClick={() => handleSubmitAction("push")}
              disabled={submitting}
              className="w-full justify-start hover:bg-[#2a2a2a] text-white border border-white/20 h-auto py-4 bg-transparent shadow-none"
            >
              <Send className="w-5 h-5 mr-3" />
              <div className="flex-1 text-left">
                <div className="font-semibold">Push to Admin</div>
                <div className="text-xs text-gray-400 mt-1">Escalate this investigation to admin review</div>
              </div>
            </Button>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setSubmitDialogOpen(false)}
              disabled={submitting}
              className="text-gray-400 hover:text-white hover:bg-[#2a2a2a]"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
