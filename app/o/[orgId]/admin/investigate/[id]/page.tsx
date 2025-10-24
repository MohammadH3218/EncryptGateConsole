"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  AlertTriangle,
  FileText,
  Mail,
  Shield,
  User,
  Clock,
  Copy,
  ExternalLink,
  Network,
  Flag,
  MessageSquare,
  Bot,
  ChevronRight,
} from "lucide-react"

import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SecurityCopilotEnhanced } from "@/components/security-copilot/security-copilot"
import { cn } from "@/lib/utils"

type Investigation = {
  id?: string
  emailMessageId: string
  detectionId?: string
  priority?: "low" | "medium" | "high" | "critical"
  severity?: "low" | "medium" | "high" | "critical"
  status?: "new" | "in_progress" | "resolved" | "escalated"
  createdAt?: string
  description?: string
  assigneeName?: string
  notes?: Array<{
    id: string
    content: string
    author: string
    timestamp: string
  }>
}

type EmailData = {
  messageId: string
  subject: string
  sender: string
  recipients: string[]
  timestamp?: string
  body?: string
  bodyHtml?: string
  headers?: Record<string, string>
  attachments?: { name: string; size?: number; url?: string }[]
}

export default function InvestigatePage() {
  const router = useRouter()
  const params = useParams()

  const orgId = params.orgId as string
  const encodedId = params.id as string
  const messageId = decodeURIComponent(encodedId)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [investigation, setInvestigation] = useState<Investigation | null>(null)
  const [email, setEmail] = useState<EmailData | null>(null)

  const [notesDialogOpen, setNotesDialogOpen] = useState(false)
  const [escalateDialogOpen, setEscalateDialogOpen] = useState(false)
  const [notes, setNotes] = useState("")

  const [activeMainTab, setActiveMainTab] = useState<"overview" | "email" | "notes">("overview")
  const [activeEmailTab, setActiveEmailTab] = useState<"content" | "html" | "headers" | "attachments">("content")
  const [copilotOpen, setCopilotOpen] = useState(false)

  const fetchInvestigation = useCallback(async () => {
    try {
      const request = await fetch(`/api/investigations/${encodeURIComponent(messageId)}`, { cache: "no-store" })
      if (request.ok) {
        const data = await request.json()
        setInvestigation({
          emailMessageId: messageId,
          ...data,
        })
        return
      }
    } catch (err) {
      console.warn("Investigation fetch failed", err)
    }

    setInvestigation({
      emailMessageId: messageId,
      severity: "medium",
      status: "in_progress",
      description: "Investigation details unavailable (using fallback data).",
    })
  }, [messageId])

  const fetchEmail = useCallback(async () => {
    const attemptSingle = async (url: string) => {
      try {
        const res = await fetch(url, {
          cache: "no-store",
          headers: {
            'x-org-id': orgId
          }
        })
        if (res.ok) {
          const payload = await res.json()
          console.log('📧 Email fetch response:', payload)
          return payload?.email ?? payload
        }
      } catch (error) {
        console.warn(`Failed fetching ${url}`, error)
      }
      return null
    }

    const direct =
      (await attemptSingle(`/api/email/${encodeURIComponent(messageId)}`)) ??
      (await attemptSingle(`/api/email?messageId=${encodeURIComponent(messageId)}`))

    if (direct) {
      console.log('✅ Found email directly:', direct)
      return direct
    }

    try {
      const res = await fetch("/api/email?limit=1000", {
        cache: "no-store",
        headers: {
          'x-org-id': orgId
        }
      })
      if (res.ok) {
        const payload = await res.json()
        const found = (payload.emails || []).find((item: any) => item.messageId === messageId)
        console.log('📧 Found email in list:', found)
        return found ?? null
      }
    } catch (error) {
      console.warn("Failed fetching fallback email list", error)
    }
    return null
  }, [messageId, orgId])

  useEffect(() => {
    let mounted = true
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        await Promise.all([
          fetchInvestigation(),
          (async () => {
            const rawEmail = await fetchEmail()
            if (!mounted) return
            if (rawEmail) {
              setEmail({
                messageId,
                subject: rawEmail.subject ?? "(No subject)",
                sender: rawEmail.sender ?? "",
                recipients: rawEmail.recipients ?? [],
                timestamp: rawEmail.timestamp,
                body: rawEmail.body,
                bodyHtml: rawEmail.bodyHtml,
                headers: rawEmail.headers,
                attachments: (rawEmail.attachments || []).map((attachment: any) =>
                  typeof attachment === "string" ? { name: attachment } : attachment,
                ),
              })
            }
          })(),
        ])
      } catch (err: any) {
        if (mounted) {
          setError(err?.message || "Failed to load investigation")
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }
    run()
    return () => {
      mounted = false
    }
  }, [fetchEmail, fetchInvestigation, messageId])

  const markResolved = async () => {
    try {
      setSaving(true)
      await fetch(`/api/investigations/${encodeURIComponent(messageId)}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved", notes }),
      }).catch(() => null)
      setInvestigation((prev) => (prev ? { ...prev, status: "resolved" } : prev))
      setNotesDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const escalate = async () => {
    try {
      setSaving(true)
      await fetch(`/api/investigations/${encodeURIComponent(messageId)}/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: notes || "Escalated from investigator view" }),
      }).catch(() => null)
      setInvestigation((prev) => (prev ? { ...prev, status: "escalated" } : prev))
      setEscalateDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const severityConfig = useMemo(() => {
    const severity = (investigation?.severity || "medium").toLowerCase()
    const configs = {
      critical: { text: "Critical", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/50" },
      high: { text: "High", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/50" },
      medium: { text: "Medium", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/50" },
      low: { text: "Low", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/50" },
    }
    return configs[severity as keyof typeof configs] || configs.medium
  }, [investigation?.severity])

  const statusConfig = useMemo(() => {
    const status = (investigation?.status || "in_progress").toLowerCase()
    const configs = {
      new: { text: "New", color: "text-blue-400", bg: "bg-blue-500/10" },
      in_progress: { text: "In Progress", color: "text-yellow-400", bg: "bg-yellow-500/10" },
      resolved: { text: "Resolved", color: "text-green-400", bg: "bg-green-500/10" },
      escalated: { text: "Escalated", color: "text-red-400", bg: "bg-red-500/10" },
    }
    return configs[status as keyof typeof configs] || configs.in_progress
  }, [investigation?.status])

  const backToAssignments = () => router.push(`/o/${orgId}/admin/assignments`)

  if (loading) {
    return (
      <AppLayout>
        <FadeInSection>
          <div className="max-w-[1400px] space-y-6">
            <Card className="bg-app-surface border-app-border">
              <CardContent className="p-10">
                <div className="flex items-center gap-3 text-app-textPrimary">
                  <Shield className="h-5 w-5 text-app-accent" />
                  <span>Loading investigation…</span>
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <Skeleton className="h-6 w-48 bg-app-elevated" />
                  <Skeleton className="h-6 w-56 bg-app-elevated" />
                  <Skeleton className="h-24 md:col-span-2 bg-app-elevated" />
                </div>
              </CardContent>
            </Card>
          </div>
        </FadeInSection>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <FadeInSection>
        <div className="max-w-[1400px] space-y-6">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={backToAssignments}
                className="text-app-textSecondary hover:bg-app-elevated hover:text-app-textPrimary"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Assignments
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`${severityConfig.bg} ${severityConfig.color} border ${severityConfig.border}`}>
                <Flag className="mr-1 h-3 w-3" />
                {severityConfig.text} Priority
              </Badge>
              <Badge className={`${statusConfig.bg} ${statusConfig.color}`}>
                {statusConfig.text}
              </Badge>
            </div>
          </div>

          {/* Investigation Title Card */}
          <Card className="bg-app-surface border-app-border">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <CardTitle className="text-2xl text-app-textPrimary flex items-center gap-2">
                    <Shield className="h-6 w-6 text-app-accent" />
                    Email Investigation
                  </CardTitle>
                  <CardDescription className="text-app-textSecondary text-base">
                    {email?.subject || "(No subject)"}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/investigate/${encodeURIComponent(messageId)}`, '_blank')}
                    className="border-app-border bg-app-elevated text-app-textSecondary hover:bg-app-overlay hover:text-app-textPrimary"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open AI Copilot
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(messageId)}
                    className="border-app-border bg-app-elevated text-app-textSecondary hover:bg-app-overlay hover:text-app-textPrimary"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy ID
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          {error ? (
            <Card className="bg-red-500/5 border-red-500/40">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 text-red-400">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="font-medium">Error loading investigation</span>
                </div>
                <p className="mt-2 text-red-300">{error}</p>
              </CardContent>
            </Card>
          ) : null}

          {/* Main Tabs */}
          <Tabs value={activeMainTab} onValueChange={(v) => setActiveMainTab(v as any)} className="space-y-6">
            <div className="flex items-center justify-between">
              <TabsList className="inline-flex h-12 items-center justify-start gap-1 rounded-xl bg-app-elevated p-1 border border-app-border">
                <TabsTrigger
                  value="overview"
                  className="data-[state=active]:bg-app-surface data-[state=active]:text-app-textPrimary data-[state=active]:shadow-sm text-app-textSecondary"
                >
                  <Shield className="mr-2 h-4 w-4" />
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="email"
                  className="data-[state=active]:bg-app-surface data-[state=active]:text-app-textPrimary data-[state=active]:shadow-sm text-app-textSecondary"
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Email Analysis
                </TabsTrigger>
                <TabsTrigger
                  value="notes"
                  className="data-[state=active]:bg-app-surface data-[state=active]:text-app-textPrimary data-[state=active]:shadow-sm text-app-textSecondary"
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Investigation Notes
                </TabsTrigger>
              </TabsList>

              {/* Floating Copilot Button */}
              <Button
                onClick={() => setCopilotOpen(!copilotOpen)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Bot className="mr-2 h-4 w-4" />
                {copilotOpen ? "Close AI Copilot" : "Open AI Copilot"}
              </Button>
            </div>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Investigation Details */}
                <Card className="bg-app-surface border-app-border">
                  <CardHeader>
                    <CardTitle className="text-lg text-app-textPrimary">Investigation Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <MetaRow label="Status" icon={<Flag className="h-4 w-4" />}>
                      <Badge className={`${statusConfig.bg} ${statusConfig.color}`}>
                        {statusConfig.text}
                      </Badge>
                    </MetaRow>
                    <MetaRow label="Priority" icon={<AlertTriangle className="h-4 w-4" />}>
                      <Badge className={`${severityConfig.bg} ${severityConfig.color}`}>
                        {severityConfig.text}
                      </Badge>
                    </MetaRow>
                    <MetaRow label="Created" icon={<Clock className="h-4 w-4" />}>
                      {investigation?.createdAt
                        ? new Date(investigation.createdAt).toLocaleString()
                        : email?.timestamp
                        ? new Date(email.timestamp).toLocaleString()
                        : "—"}
                    </MetaRow>
                    {investigation?.assigneeName && (
                      <MetaRow label="Assigned To" icon={<User className="h-4 w-4" />}>
                        {investigation.assigneeName}
                      </MetaRow>
                    )}
                    {investigation?.description && (
                      <div className="pt-2 border-t border-app-border">
                        <div className="text-sm font-medium text-app-textSecondary mb-2">Description</div>
                        <p className="text-app-textPrimary text-sm">{investigation.description}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Email Metadata */}
                <Card className="bg-app-surface border-app-border">
                  <CardHeader>
                    <CardTitle className="text-lg text-app-textPrimary">Email Metadata</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <MetaRow label="Subject" icon={<Mail className="h-4 w-4" />}>
                      {email?.subject || "(No subject)"}
                    </MetaRow>
                    <MetaRow label="From" icon={<User className="h-4 w-4" />}>
                      {email?.sender || "—"}
                    </MetaRow>
                    <MetaRow label="To" icon={<User className="h-4 w-4" />}>
                      {email?.recipients?.join(", ") || "—"}
                    </MetaRow>
                    <MetaRow label="Timestamp" icon={<Clock className="h-4 w-4" />}>
                      {email?.timestamp ? new Date(email.timestamp).toLocaleString() : "—"}
                    </MetaRow>
                    <MetaRow label="Message ID" icon={<Network className="h-4 w-4" />}>
                      <code className="text-xs bg-app-elevated px-2 py-1 rounded">
                        {messageId.length > 40 ? `${messageId.substring(0, 40)}...` : messageId}
                      </code>
                    </MetaRow>
                  </CardContent>
                </Card>
              </div>

              {/* Quick Actions */}
              <Card className="bg-app-surface border-app-border">
                <CardHeader>
                  <CardTitle className="text-lg text-app-textPrimary">Investigation Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={() => setNotesDialogOpen(true)}
                      className="bg-app-accent hover:bg-app-accentHover text-white"
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Mark as Resolved
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setEscalateDialogOpen(true)}
                      className="border-app-border bg-app-elevated text-app-textPrimary hover:bg-app-overlay"
                    >
                      <AlertTriangle className="mr-2 h-4 w-4" />
                      Escalate to Admin
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setNotesDialogOpen(true)}
                      className="border-app-border bg-app-elevated text-app-textPrimary hover:bg-app-overlay"
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Add Notes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => window.open(`/api/email/raw?messageId=${encodeURIComponent(messageId)}`, "_blank")}
                      className="border-app-border bg-app-elevated text-app-textPrimary hover:bg-app-overlay"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Raw Email
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Email Analysis Tab */}
            <TabsContent value="email" className="space-y-6">
              <Card className="bg-app-surface border-app-border">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg text-app-textPrimary">Email Content</CardTitle>
                    <Tabs value={activeEmailTab} onValueChange={(v) => setActiveEmailTab(v as any)}>
                      <TabsList className="h-10 bg-app-elevated border border-app-border">
                        <TabsTrigger value="content" className="data-[state=active]:bg-app-surface data-[state=active]:text-app-textPrimary text-app-textSecondary">
                          Content
                        </TabsTrigger>
                        <TabsTrigger value="html" className="data-[state=active]:bg-app-surface data-[state=active]:text-app-textPrimary text-app-textSecondary">
                          HTML
                        </TabsTrigger>
                        <TabsTrigger value="headers" className="data-[state=active]:bg-app-surface data-[state=active]:text-app-textPrimary text-app-textSecondary">
                          Headers
                        </TabsTrigger>
                        <TabsTrigger value="attachments" className="data-[state=active]:bg-app-surface data-[state=active]:text-app-textPrimary text-app-textSecondary">
                          Attachments
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </CardHeader>
                <CardContent>
                  {activeEmailTab === "content" && (
                    <div className="prose prose-invert max-w-none">
                      {email?.body ? (
                        <pre className="whitespace-pre-wrap text-app-textPrimary bg-app-elevated p-4 rounded-lg border border-app-border text-sm">
                          {email.body}
                        </pre>
                      ) : email?.bodyHtml ? (
                        <div
                          className="overflow-hidden rounded-lg border border-app-border bg-white p-4"
                          dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
                        />
                      ) : (
                        <EmptyState label="No email content available" />
                      )}
                    </div>
                  )}

                  {activeEmailTab === "html" && (
                    <>
                      {email?.bodyHtml ? (
                        <div
                          className="overflow-hidden rounded-lg border border-app-border bg-white p-4"
                          dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
                        />
                      ) : (
                        <EmptyState label="No HTML body available" />
                      )}
                    </>
                  )}

                  {activeEmailTab === "headers" && (
                    <>
                      {email?.headers ? (
                        <div className="overflow-x-auto rounded-lg border border-app-border">
                          <table className="w-full text-sm">
                            <tbody className="divide-y divide-app-border">
                              {Object.entries(email.headers).map(([key, value]) => (
                                <tr key={key} className="hover:bg-app-elevated transition-colors">
                                  <td className="w-48 px-4 py-3 font-mono text-xs text-app-textSecondary">{key}</td>
                                  <td className="px-4 py-3 text-app-textPrimary font-mono text-xs break-all">{String(value)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <EmptyState label="No headers available" />
                      )}
                    </>
                  )}

                  {activeEmailTab === "attachments" && (
                    <>
                      {email?.attachments && email.attachments.length > 0 ? (
                        <div className="space-y-2">
                          {email.attachments.map((attachment, index) => (
                            <div
                              key={`${attachment.name}-${index}`}
                              className="flex items-center justify-between rounded-lg border border-app-border bg-app-elevated px-4 py-3 hover:bg-app-overlay transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <FileText className="h-5 w-5 text-app-accent" />
                                <div>
                                  <div className="text-sm font-medium text-app-textPrimary">{attachment.name}</div>
                                  {attachment.size && (
                                    <div className="text-xs text-app-textMuted">
                                      {(attachment.size / 1024).toFixed(2)} KB
                                    </div>
                                  )}
                                </div>
                              </div>
                              {attachment.url ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  asChild
                                  className="border-app-border text-app-textSecondary hover:text-app-textPrimary"
                                >
                                  <a href={attachment.url} target="_blank" rel="noreferrer">
                                    <ExternalLink className="mr-2 h-3 w-3" />
                                    Download
                                  </a>
                                </Button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState label="No attachments" />
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Investigation Notes Tab */}
            <TabsContent value="notes" className="space-y-6">
              <Card className="bg-app-surface border-app-border">
                <CardHeader>
                  <CardTitle className="text-lg text-app-textPrimary">Investigation Timeline</CardTitle>
                  <CardDescription className="text-app-textSecondary">
                    Track all actions, notes, and changes related to this investigation
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {investigation?.notes && investigation.notes.length > 0 ? (
                    <div className="space-y-4">
                      {investigation.notes.map((note) => (
                        <div key={note.id} className="border-l-2 border-app-accent pl-4 py-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-app-textPrimary">{note.author}</span>
                            <span className="text-xs text-app-textMuted">
                              {new Date(note.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm text-app-textSecondary">{note.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState label="No investigation notes yet. Add notes to track your progress." />
                  )}

                  <div className="mt-6">
                    <Button
                      onClick={() => setNotesDialogOpen(true)}
                      className="bg-app-accent hover:bg-app-accentHover text-white"
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Add Investigation Note
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </FadeInSection>

      {/* Dialogs */}
      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent className="border-app-border bg-app-surface text-app-textPrimary">
          <DialogHeader>
            <DialogTitle>Add Investigation Notes</DialogTitle>
          </DialogHeader>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Enter your investigation notes here..."
            className="bg-app-elevated border-app-border text-app-textPrimary placeholder:text-app-textMuted min-h-[120px]"
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setNotesDialogOpen(false)}
              className="text-app-textSecondary hover:text-app-textPrimary"
            >
              Cancel
            </Button>
            <Button
              onClick={markResolved}
              disabled={saving}
              className="bg-app-accent hover:bg-app-accentHover text-white"
            >
              {saving ? "Saving..." : "Save & Mark Resolved"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={escalateDialogOpen} onOpenChange={setEscalateDialogOpen}>
        <DialogContent className="border-app-border bg-app-surface text-app-textPrimary">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
              Escalate Investigation
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-app-textSecondary">
            Provide a reason for escalating this investigation to an administrator.
          </p>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Reason for escalation..."
            className="bg-app-elevated border-app-border text-app-textPrimary placeholder:text-app-textMuted min-h-[120px]"
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEscalateDialogOpen(false)}
              className="text-app-textSecondary hover:text-app-textPrimary"
            >
              Cancel
            </Button>
            <Button
              onClick={escalate}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {saving ? "Escalating..." : "Escalate to Admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating Copilot Drawer */}
      {copilotOpen && (
        <div className="fixed bottom-0 right-0 top-0 z-50 w-full max-w-2xl bg-app-surface border-l border-app-border shadow-2xl overflow-hidden flex flex-col">
          {/* Copilot Header */}
          <div className="flex items-center justify-between p-4 border-b border-app-border bg-app-elevated">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-app-textPrimary">AI Investigation Assistant</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCopilotOpen(false)}
              className="text-app-textSecondary hover:text-app-textPrimary"
            >
              ✕
            </Button>
          </div>

          {/* Copilot Content with scroll */}
          <div className="flex-1 overflow-hidden">
            <SecurityCopilotEnhanced
              emailData={email}
              messageId={messageId}
              className="border-0 h-full"
            />
          </div>
        </div>
      )}

      {/* Overlay */}
      {copilotOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setCopilotOpen(false)}
        />
      )}
    </AppLayout>
  )
}

function MetaRow({
  label,
  icon,
  children,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center gap-2 text-app-textSecondary min-w-[120px]">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex-1 text-app-textPrimary text-sm font-medium">{children}</div>
    </div>
  )
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-app-border last:border-0">
      <span className="text-xs text-app-textSecondary">{label}</span>
      <span className="text-xs text-app-textPrimary font-medium">{children}</span>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-app-border bg-app-elevated px-6 py-8 text-center justify-center">
      <Copy className="h-5 w-5 text-app-textMuted" />
      <span className="text-app-textMuted">{label}</span>
    </div>
  )
}
