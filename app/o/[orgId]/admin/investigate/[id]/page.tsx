"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowUpRight,
  AlertTriangle,
  FileText,
  Mail,
  Shield,
  User,
  Clock,
  Copy,
} from "lucide-react"

import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Kebab } from "@/components/ui/kebab"
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

  const [activeTab, setActiveTab] = useState<"content" | "html" | "headers" | "attachments">("content")

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
        const res = await fetch(url, { cache: "no-store" })
        if (res.ok) {
          const payload = await res.json()
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
      return direct
    }

    try {
      const res = await fetch("/api/email?limit=1000", { cache: "no-store" })
      if (res.ok) {
        const payload = await res.json()
        const found = (payload.emails || []).find((item: any) => item.messageId === messageId)
        return found ?? null
      }
    } catch (error) {
      console.warn("Failed fetching fallback email list", error)
    }
    return null
  }, [messageId])

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

  const severityTone = useMemo(() => {
    const severity = (investigation?.severity || "medium").toLowerCase()
    if (severity === "critical") return "text-red-400 border-red-500/50"
    if (severity === "high") return "text-orange-300 border-orange-500/50"
    if (severity === "low") return "text-blue-300 border-blue-500/50"
    return "text-yellow-300 border-yellow-500/50"
  }, [investigation?.severity])

  const backToAssignments = () => router.push(`/o/${orgId}/admin/assignments`)
  const backToDetections = () => router.push(`/o/${orgId}/admin/detections`)

  if (loading) {
    return (
      <AppLayout>
        <FadeInSection>
          <div className="max-w-[1200px] space-y-6">
            <Card className="card p-10">
              <div className="flex items-center gap-3 text-white/80">
                <Shield className="h-5 w-5" />
                <span>Loading investigation…</span>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-6 w-56" />
                <Skeleton className="h-24 md:col-span-2" />
              </div>
            </Card>
          </div>
        </FadeInSection>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <FadeInSection>
        <div className="max-w-[1200px] space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Button
                variant="ghost"
                size="sm"
                onClick={backToAssignments}
                className="pressable text-white/70 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-ring"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Assignments
              </Button>
              <span className="hidden h-4 w-px bg-app-border lg:block" />
              <Button
                variant="ghost"
                size="sm"
                onClick={backToDetections}
                className="pressable text-white/70 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-ring"
              >
                Back to Detections
              </Button>
            </div>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${severityTone}`}>
              {(investigation?.severity || "Medium").toString().toUpperCase()} PRIORITY
            </span>
          </div>

          {error ? (
            <Card className="card border-red-500/40 bg-red-500/5 text-red-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-200">
                  <AlertTriangle className="h-5 w-5" />
                  Error loading investigation
                </CardTitle>
              </CardHeader>
              <CardContent>{error}</CardContent>
            </Card>
          ) : null}

          <Card className="card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-white">
                  <Shield className="h-5 w-5" />
                  Investigation Details
                </CardTitle>
                <Badge variant="outline" className="border-app-border text-white/70">
                  ID: {messageId}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <Meta label="Email Subject" icon={<Mail className="h-4 w-4" />}>
                  {email?.subject || "(No subject)"}
                </Meta>
                <Meta label="Sender" icon={<User className="h-4 w-4" />}>
                  {email?.sender || "—"}
                </Meta>
                <Meta label="Recipient(s)" icon={<User className="h-4 w-4" />}>
                  {email?.recipients?.join(", ") || "—"}
                </Meta>
                <Meta label="Created" icon={<Clock className="h-4 w-4" />}>
                  {investigation?.createdAt
                    ? new Date(investigation.createdAt).toLocaleString()
                    : email?.timestamp
                    ? new Date(email.timestamp).toLocaleString()
                    : "—"}
                </Meta>
              </div>

              {investigation?.description ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-white/60">
                    <Shield className="h-4 w-4" />
                    <span className="text-sm">Description</span>
                  </div>
                  <p className="text-white/90">{investigation.description}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white">Investigation Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={() => setNotesDialogOpen(true)}
                className="pressable border-app-border bg-app-surface text-white hover:bg-white/5 focus-visible:outline-none focus-ring"
              >
                Mark as Resolved
              </Button>
              <Button
                variant="outline"
                onClick={() => setEscalateDialogOpen(true)}
                className="pressable border-app-border bg-app-surface text-white hover:bg-white/5 focus-visible:outline-none focus-ring"
              >
                Escalate to Admin
              </Button>
              <Button
                variant="outline"
                onClick={() => setNotesDialogOpen(true)}
                className="pressable border-app-border bg-app-surface text-white hover:bg-white/5 focus-visible:outline-none focus-ring"
              >
                Add Notes
              </Button>
              <div className="ml-auto">
                <Kebab
                  items={[
                    {
                      label: "Copy Message-ID",
                      onClick: () => navigator.clipboard.writeText(messageId),
                    },
                    {
                      label: "Open raw email in new tab",
                      onClick: () => window.open(`/api/email/raw?messageId=${encodeURIComponent(messageId)}`, "_blank"),
                    },
                  ]}
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="card">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base text-white">Email</CardTitle>
                  <div className="inline-flex rounded-lg border border-app-border bg-app-surface p-0.5">
                    {(["content", "html", "headers", "attachments"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-xs capitalize transition-colors",
                          activeTab === tab ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5",
                        )}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {activeTab === "content" && (
                  <div className="prose prose-invert max-w-none">
                    {email?.body ? (
                      <pre className="whitespace-pre-wrap text-white/90">{email.body}</pre>
                    ) : email?.bodyHtml ? (
                      <div
                        className="overflow-hidden rounded-xl border border-app-border bg-app-surface"
                        dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
                      />
                    ) : (
                      <EmptyState label="No email content available" />
                    )}
                  </div>
                )}

                {activeTab === "html" && (
                  <>
                    {email?.bodyHtml ? (
                      <div
                        className="overflow-hidden rounded-xl border border-app-border bg-app-surface"
                        dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
                      />
                    ) : (
                      <EmptyState label="No HTML body" />
                    )}
                  </>
                )}

                {activeTab === "headers" && (
                  <>
                    {email?.headers ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <tbody>
                            {Object.entries(email.headers).map(([key, value]) => (
                              <tr key={key} className="border-b border-app-border/60 hover:bg-white/5">
                                <td className="w-48 px-3 py-2 text-white/60">{key}</td>
                                <td className="px-3 py-2 text-white/90">{String(value)}</td>
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

                {activeTab === "attachments" && (
                  <>
                    {email?.attachments && email.attachments.length > 0 ? (
                      <ul className="space-y-2">
                        {email.attachments.map((attachment, index) => (
                          <li
                            key={`${attachment.name}-${index}`}
                            className="flex items-center justify-between rounded-lg border border-app-border bg-app-surface px-3 py-2"
                          >
                            <div className="flex items-center gap-2 text-sm">
                              <FileText className="h-4 w-4" />
                              <span>{attachment.name}</span>
                            </div>
                            {attachment.url ? (
                              <a
                                href={attachment.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-white/80 underline hover:text-white"
                              >
                                Download
                              </a>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyState label="No attachments" />
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <CopilotPanel
              email={email}
              orgId={orgId}
            />
          </div>
        </div>
      </FadeInSection>

      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent className="max-w-lg border-app-border bg-app-panel text-white">
          <DialogHeader>
            <DialogTitle>Add notes</DialogTitle>
          </DialogHeader>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Investigation notes (visible to your team)…"
            className="bg-app-surface text-white"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNotesDialogOpen(false)} className="text-white/70">
              Cancel
            </Button>
            <Button onClick={markResolved} disabled={saving} className="pressable">
              Save &amp; mark resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={escalateDialogOpen} onOpenChange={setEscalateDialogOpen}>
        <DialogContent className="max-w-md border-app-border bg-app-panel text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
              Escalate to admin?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-white/70">
            Provide an optional reason. This will be included in the escalation report.
          </p>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Reason for escalation"
            className="bg-app-surface text-white"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEscalateDialogOpen(false)} className="text-white/70">
              Cancel
            </Button>
            <Button onClick={escalate} disabled={saving} className="pressable">
              Escalate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}

function Meta({
  label,
  icon,
  children,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-white/60">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-white font-medium">{children}</div>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-app-border/60 bg-app-surface px-3 py-3 text-sm text-white/60">
      <Copy className="h-4 w-4" />
      {label}
    </div>
  )
}

function CopilotPanel({ email, orgId }: { email: EmailData | null; orgId: string }) {
  const [busy, setBusy] = useState(false)
  const [output, setOutput] = useState("")

  const run = async (action: "summarize" | "analyze" | "suggest") => {
    if (!email) return
    setBusy(true)
    setOutput("")
    try {
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          orgId,
          email: {
            subject: email.subject,
            body: email.body,
            bodyHtml: email.bodyHtml,
            headers: email.headers,
            sender: email.sender,
            recipients: email.recipients,
            timestamp: email.timestamp,
          },
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setOutput(data.text ?? JSON.stringify(data))
      } else {
        setOutput("Copilot endpoint returned an error.")
      }
    } catch (error) {
      console.warn("Copilot request failed", error)
      setOutput("Copilot endpoint is not available.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-white">Copilot</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button onClick={() => run("summarize")} disabled={!email || busy} className="pressable">
            Summarize Email
          </Button>
          <Button onClick={() => run("analyze")} disabled={!email || busy} className="pressable">
            Analyze Threat
          </Button>
          <Button onClick={() => run("suggest")} disabled={!email || busy} className="pressable">
            Suggest Action
          </Button>
        </div>
        <div className="min-h-[140px] rounded-xl border border-app-border bg-app-surface p-3 text-sm text-white/80">
          {busy ? "Thinking…" : output || "Results will appear here."}
        </div>
        <a
          href={`/o/${orgId}/admin/all-emails?messageId=${encodeURIComponent(email?.messageId || "")}`}
          className="inline-flex items-center gap-1 text-sm text-white/80 hover:underline"
        >
          Open in All Emails <ArrowUpRight className="h-3 w-3" />
        </a>
      </CardContent>
    </Card>
  )
}
