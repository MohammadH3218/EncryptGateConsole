"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { AlertTriangle, ArrowLeft, Ban, CheckCircle, Loader2, Send, Shield, RefreshCw } from "lucide-react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { InvestigationCanvas } from "@/components/investigation-workspace/InvestigationCanvas"
import type { EmailDetails, InvestigationSummary } from "@/components/investigation-workspace/types"

const GRAPH_TRIGGERS = ["sender", "recipient", "emails", "campaign", "graph", "relationship"]

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

  useEffect(() => {
    loadData()
  }, [emailId])

  const handleAssistantQuery = (query: string) => {
    setActiveQuery(query)
    const shouldShowGraph = GRAPH_TRIGGERS.some((trigger) => query.toLowerCase().includes(trigger))
    if (shouldShowGraph) {
      setShowGraph(true)
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
        response = await fetch(`/api/email/${encodeURIComponent(emailData.messageId)}/block`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageId: emailData.messageId,
            sender: emailData.sender,
            reason: "Blocked from investigation",
          }),
        })
      } else if (action === "allow") {
        response = await fetch(`/api/email/${encodeURIComponent(emailData.messageId)}/allow`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageId: emailData.messageId,
            reason: "Allowed from investigation",
          }),
        })
      } else if (action === "push") {
        response = await fetch(`/api/admin/pushed-requests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emailMessageId: emailData.messageId,
            investigationId: investigation?.investigationId,
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
      <AppLayout notificationsCount={0}>
        <FadeInSection>
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <RefreshCw className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
              <p className="text-white font-medium mb-2">Loading investigation...</p>
              <p className="text-gray-400 text-sm">Retrieving email data and security analysis</p>
            </div>
          </div>
        </FadeInSection>
      </AppLayout>
    )
  }

  if (error || !emailData) {
    return (
      <AppLayout notificationsCount={0}>
        <FadeInSection>
          <div className="flex items-center justify-center py-12">
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
        </FadeInSection>
      </AppLayout>
    )
  }

  return (
    <AppLayout notificationsCount={investigation?.status === "new" ? 1 : 0}>
      <FadeInSection>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2 text-white">
                <Shield className="h-6 w-6 text-white" />
                Investigation: {emailData.subject || "No Subject"}
              </h2>
              <p className="text-gray-400 mt-1">
                Email from {emailData.sender} • Received {new Date(emailData.timestamp).toLocaleDateString()}
              </p>
            </div>
            <Button
              onClick={() => setSubmitDialogOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Send className="w-4 h-4 mr-2" />
              Submit Investigation
            </Button>
          </div>

          {/* Main Investigation Content */}
          <InvestigationCanvas
            email={emailData}
            investigation={investigation}
            showGraph={showGraph}
            onCloseGraph={() => setShowGraph(false)}
            activeQuery={activeQuery}
          />
        </div>
      </FadeInSection>

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
              className="w-full justify-start bg-red-900/20 hover:bg-red-900/40 text-red-300 border border-red-600/30 h-auto py-4"
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
              className="w-full justify-start bg-green-900/20 hover:bg-green-900/40 text-green-300 border border-green-600/30 h-auto py-4"
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
              className="w-full justify-start bg-[#1f1f1f] hover:bg-[#2a2a2a] text-white border border-white/20 h-auto py-4"
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
    </AppLayout>
  )
}
