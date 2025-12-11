"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowDownLeft,
  Check,
  Clock,
  Copy,
  FileText,
  HardDrive,
  Hash,
  ImageIcon,
  Mail,
  User,
  Users,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { EmailDetails, InvestigationSummary } from "./types"

function MetadataRow({
  icon: Icon,
  label,
  value,
  copyable = false,
}: {
  icon: React.ElementType
  label: string
  value?: string
  copyable?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const display = value || "Not provided"

  const handleCopy = () => {
    if (!value) return
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-xs text-foreground break-all leading-tight">{display}</p>
      </div>
      {copyable && value && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground shrink-0"
          onClick={handleCopy}
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        </Button>
      )}
    </div>
  )
}

function formatTimestamp(value?: string) {
  if (!value) return "Unknown"
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function formatSize(bytes?: number) {
  if (!bytes) return "0 KB"
  return `${(bytes / 1024).toFixed(1)} KB`
}

interface EmailSummaryPanelProps {
  email: EmailDetails
  investigation?: InvestigationSummary | null
}

export function EmailSummaryPanel({ email, investigation }: EmailSummaryPanelProps) {
  const riskIndicators = useMemo(() => {
    const items: string[] = []
    if (email.flaggedCategory && email.flaggedCategory !== "none") {
      items.push(`Flagged: ${email.flaggedCategory}${email.flaggedSeverity ? ` (${email.flaggedSeverity})` : ""}`)
    }
    if (email.urls?.length) {
      items.push(`${email.urls.length} URL${email.urls.length > 1 ? "s" : ""} detected`)
    }
    if (email.attachments?.length) {
      items.push(`${email.attachments.length} attachment${email.attachments.length > 1 ? "s" : ""} included`)
    }
    if (investigation?.priority) {
      items.push(`Investigation priority: ${investigation.priority}`)
    }
    if (email.threatLevel) {
      items.push(`Threat level: ${email.threatLevel}`)
    }
    return items
  }, [email.attachments?.length, email.flaggedCategory, email.flaggedSeverity, email.threatLevel, email.urls?.length, investigation?.priority])

  const recipients = email.recipients?.length ? email.recipients.join(", ") : "Not provided"
  const cc = email.cc?.length ? email.cc.join(", ") : ""

  return (
    <div className="p-3 space-y-3 h-full overflow-y-auto">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-teal" />
        <h2 className="font-semibold text-sm text-foreground">Email Summary</h2>
      </div>

      <Card className="glass-card border-border/50">
        <CardHeader className="pb-1 pt-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-medium text-muted-foreground">Email Metadata</CardTitle>
            <Badge className="bg-electric-blue/10 text-electric-blue border-electric-blue/30 text-[10px] h-5 capitalize">
              <ArrowDownLeft className="w-2.5 h-2.5 mr-1" />
              {email.direction || "unknown"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-0">
          <MetadataRow icon={Mail} label="Subject" value={email.subject || "No subject"} />
          <MetadataRow icon={User} label="Sender" value={email.sender} copyable />
          <MetadataRow icon={Users} label="Recipients" value={recipients} />
          {cc && <MetadataRow icon={Users} label="CC" value={cc} />}
          <MetadataRow icon={Hash} label="Message ID" value={email.messageId} copyable />
          <MetadataRow icon={Clock} label="Received" value={formatTimestamp(email.timestamp)} />
          <MetadataRow icon={HardDrive} label="Size" value={formatSize(email.size)} />
        </CardContent>
      </Card>

      <Card className="glass-card border-border/50 flex-1 overflow-hidden">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid grid-cols-4 bg-secondary/50 mx-2 mt-2 mb-0 h-8 w-[calc(100%-16px)]">
            <TabsTrigger value="overview" className="text-[10px] px-1">
              Overview
            </TabsTrigger>
            <TabsTrigger value="headers" className="text-[10px] px-1">
              Headers
            </TabsTrigger>
            <TabsTrigger value="body" className="text-[10px] px-1">
              Body
            </TabsTrigger>
            <TabsTrigger value="attachments" className="text-[10px] px-1">
              Attachments {email.attachments?.length ? `(${email.attachments.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="p-3 pt-2">
            <div className="space-y-2">
              {riskIndicators.length > 0 ? (
                <div className="p-2 rounded-lg bg-danger/10 border border-danger/20">
                  <div className="flex items-center gap-2 text-danger mb-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span className="text-xs font-medium">Risk Indicators</span>
                  </div>
                  <ul className="text-[10px] text-muted-foreground space-y-0.5 ml-5 list-disc">
                    {riskIndicators.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="p-2 rounded-lg bg-secondary/30 border border-border/50 text-[11px] text-muted-foreground">
                  No risk indicators provided for this email yet.
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                {investigation?.description ||
                  "Monitor the investigation assistant for findings and request additional signals as needed."}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="headers" className="p-3 pt-2">
            <pre className="text-[10px] text-muted-foreground bg-secondary/30 p-2 rounded-lg overflow-x-auto font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto">
              {email.headers ? JSON.stringify(email.headers, null, 2) : "No headers available"}
            </pre>
          </TabsContent>

          <TabsContent value="body" className="p-3 pt-2">
            {email.htmlBody ? (
              <div className="bg-secondary/30 border border-border/50 rounded-lg overflow-hidden">
                <iframe
                  srcDoc={email.htmlBody}
                  className="w-full min-h-[260px] bg-white"
                  title="Email HTML Content"
                  sandbox="allow-same-origin"
                />
              </div>
            ) : (
              <pre className="text-[10px] text-foreground/80 bg-secondary/30 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-[240px] overflow-y-auto">
                {email.body || "No content"}
              </pre>
            )}
          </TabsContent>

          <TabsContent value="attachments" className="p-3 pt-2">
            <div className="space-y-2 overflow-hidden">
              {email.attachments && email.attachments.length > 0 ? (
                email.attachments.map((attachment, index) => (
                  <div
                    key={index}
                    className={cn("flex items-center gap-2 p-2 rounded-lg border transition-smooth overflow-hidden bg-secondary/30 border-border/50")}
                  >
                    {attachment.filename.toLowerCase().endsWith(".pdf") ? (
                      <FileText className="w-6 h-6 text-danger shrink-0" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{attachment.filename}</p>
                      <p className="text-[10px] text-muted-foreground">{formatSize(attachment.size)}</p>
                    </div>
                    <Badge variant="outline" className="text-[9px] shrink-0 whitespace-nowrap bg-secondary/60 border-border/60">
                      {attachment.size ? formatSize(attachment.size) : "Attached"}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-[11px] text-muted-foreground">No attachments</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  )
}
