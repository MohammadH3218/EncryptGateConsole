"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { AlertTriangle, ArrowLeft, Ban, CheckCircle, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { InvestigationCanvas } from "@/components/investigation-workspace/InvestigationCanvas"
import { EmailSummaryPanel } from "@/components/investigation-workspace/EmailSummaryPanel"
import { AIAssistantPanel } from "@/components/investigation-workspace/AIAssistantPanel"
import { TopNavigation } from "@/components/investigation-workspace/TopNavigation"
import type { EmailDetails, InvestigationSummary } from "@/components/investigation-workspace/types"

const GRAPH_TRIGGERS = ["sender", "recipient", "emails", "campaign", "graph", "relationship"]

export default function InvestigationPage() {
  const params = useParams()
  const router = useRouter()
  // Next.js already decodes route parameters, but we need to handle it carefully
  // Get the raw id and ensure proper encoding for API calls
  const rawId = params.id as string
  // Only decode if it looks encoded (contains %)
  const emailId = rawId.includes('%') ? decodeURIComponent(rawId) : rawId

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

      // Use the raw params.id for the API call to avoid double encoding issues
      // But encode it properly for the URL
      const apiMessageId = encodeURIComponent(emailId)
      console.log("📧 [Investigate Page] Calling API with encoded messageId:", apiMessageId)
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
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal to-electric-blue/40 border border-border flex items-center justify-center mx-auto">
              <Loader2 className="w-8 h-8 text-foreground animate-spin" />
            </div>
          </div>
          <p className="text-foreground font-medium mb-2">Loading investigation...</p>
          <p className="text-muted-foreground text-sm">Retrieving email data and security analysis</p>
        </div>
      </div>
    )
  }

  if (error || !emailData) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-600/10 border border-red-600/20 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-danger" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Unable to Load Email Data</h2>
          <p className="text-muted-foreground text-sm mb-4">
            {error || "The requested email could not be found. If this keeps happening, retry or contact an admin."}
          </p>
          <div className="glass-card border border-border rounded-lg p-3 mb-4">
            <p className="text-xs text-muted-foreground font-mono break-all">{emailId}</p>
          </div>
          <Button
            onClick={() => router.back()}
            variant="outline"
            className="border-border text-foreground hover:bg-secondary/60"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-background flex flex-col overflow-hidden" data-investigation-page>
      <TopNavigation
        subject={emailData.subject || "Investigation"}
        status={investigation?.status || emailData.investigationStatus}
        priority={investigation?.priority || emailData.flaggedSeverity}
        direction={emailData.direction}
        onSubmit={() => setSubmitDialogOpen(true)}
      />

      <div className="flex-1 h-0 flex">
        <div className="w-[26%] min-w-[320px] border-r border-border/50 bg-black/40">
          <EmailSummaryPanel email={emailData} investigation={investigation} />
        </div>

        <div className="flex-1 overflow-hidden">
          <InvestigationCanvas
            email={emailData}
            investigation={investigation}
            showGraph={showGraph}
            onCloseGraph={() => setShowGraph(false)}
            activeQuery={activeQuery}
          />
        </div>

        <div className="w-[24%] min-w-[280px] border-l border-border/50 bg-black/40">
          <AIAssistantPanel emailId={emailId} onQuery={handleAssistantQuery} />
        </div>
      </div>

      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="bg-background border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-foreground">Submit Investigation</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Choose an action for this email investigation
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            <Button
              onClick={() => handleSubmitAction("block")}
              disabled={submitting}
              className="w-full justify-start bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30 h-auto py-4"
            >
              <Ban className="w-5 h-5 mr-3" />
              <div className="flex-1 text-left">
                <div className="font-semibold">Block Email</div>
                <div className="text-xs text-danger/80 mt-1">Block this email and sender from future delivery</div>
              </div>
            </Button>

            <Button
              onClick={() => handleSubmitAction("allow")}
              disabled={submitting}
              className="w-full justify-start bg-cyber-green/10 hover:bg-cyber-green/20 text-cyber-green border border-cyber-green/30 h-auto py-4"
            >
              <CheckCircle className="w-5 h-5 mr-3" />
              <div className="flex-1 text-left">
                <div className="font-semibold">Allow Email</div>
                <div className="text-xs text-cyber-green/80 mt-1">Mark this email as safe</div>
              </div>
            </Button>

            <Button
              onClick={() => handleSubmitAction("push")}
              disabled={submitting}
              className="w-full justify-start bg-secondary/50 hover:bg-secondary/60 text-foreground border border-border/60 h-auto py-4"
            >
              <Send className="w-5 h-5 mr-3" />
              <div className="flex-1 text-left">
                <div className="font-semibold">Push to Admin</div>
                <div className="text-xs text-muted-foreground mt-1">Escalate this investigation to admin review</div>
              </div>
            </Button>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setSubmitDialogOpen(false)}
              disabled={submitting}
              className="text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
