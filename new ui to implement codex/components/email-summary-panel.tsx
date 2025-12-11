"use client"

import type React from "react"

import { useState } from "react"
import {
  Mail,
  User,
  Users,
  Hash,
  Clock,
  HardDrive,
  ArrowDownLeft,
  Copy,
  Check,
  ImageIcon,
  FileText,
  AlertTriangle,
  Shield,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const emailData = {
  subject: "Urgent: Verify Your Account Information Immediately",
  sender: "security-alert@bank0famerica.com",
  recipients: ["john.doe@company.com", "finance@company.com"],
  messageId: "<abc123xyz@mail.suspicious.net>",
  received: "2024-01-15 14:32:18 UTC",
  size: "24.5 KB",
  direction: "Inbound",
}

const headers = `Received: from mail.suspicious.net (unknown [192.168.1.100])
    by mx.company.com (Postfix) with ESMTP id ABC123
    for <john.doe@company.com>; Mon, 15 Jan 2024 14:32:18 +0000 (UTC)
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;
    d=bank0famerica.com; s=selector1;
From: "Bank of America Security" <security-alert@bank0famerica.com>
To: john.doe@company.com, finance@company.com
Subject: Urgent: Verify Your Account Information Immediately
Date: Mon, 15 Jan 2024 14:30:00 +0000
Message-ID: <abc123xyz@mail.suspicious.net>`

const body = `Dear Valued Customer,

We have detected unusual activity on your account. To ensure your account security, please verify your information immediately by clicking the link below:

[VERIFY NOW] - https://bank0famerica-verify.suspicious-domain.com/login

If you do not verify within 24 hours, your account will be temporarily suspended.

Thank you for your cooperation.

Bank of America Security Team`

const attachments = [
  { name: "Account_Verification.pdf", type: "pdf", size: "156 KB", status: "malicious" },
  { name: "security_notice.png", type: "image", size: "42 KB", status: "safe" },
]

function MetadataRow({
  icon: Icon,
  label,
  value,
  copyable = false,
}: {
  icon: React.ElementType
  label: string
  value: string
  copyable?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-xs text-foreground break-all leading-tight">{value}</p>
      </div>
      {copyable && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground shrink-0"
          onClick={handleCopy}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        </Button>
      )}
    </div>
  )
}

export function EmailSummaryPanel() {
  return (
    <div className="p-3 space-y-3 h-full overflow-y-auto">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-teal" />
        <h2 className="font-semibold text-sm text-foreground">Email Summary</h2>
      </div>

      {/* Email Metadata Card - more compact */}
      <Card className="glass-card border-border/50">
        <CardHeader className="pb-1 pt-3 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-medium text-muted-foreground">Email Metadata</CardTitle>
            <Badge className="bg-electric-blue/10 text-electric-blue border-electric-blue/30 text-[10px] h-5">
              <ArrowDownLeft className="w-2.5 h-2.5 mr-1" />
              {emailData.direction}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-0">
          <MetadataRow icon={Mail} label="Subject" value={emailData.subject} />
          <MetadataRow icon={User} label="Sender" value={emailData.sender} copyable />
          <MetadataRow icon={Users} label="Recipients" value={emailData.recipients.join(", ")} />
          <MetadataRow icon={Hash} label="Message ID" value={emailData.messageId} copyable />
          <MetadataRow icon={Clock} label="Received" value={emailData.received} />
          <MetadataRow icon={HardDrive} label="Size" value={emailData.size} />
        </CardContent>
      </Card>

      {/* Headers & Content Tabs - fills remaining space */}
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
              Attachments
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="p-3 pt-2">
            <div className="space-y-2">
              <div className="p-2 rounded-lg bg-danger/10 border border-danger/20">
                <div className="flex items-center gap-2 text-danger mb-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span className="text-xs font-medium">High Risk Indicators</span>
                </div>
                <ul className="text-[10px] text-muted-foreground space-y-0.5 ml-5">
                  <li>• Sender domain mimics legitimate bank</li>
                  <li>• Contains suspicious URL</li>
                  <li>• Urgency tactics detected</li>
                  <li>• Malicious attachment found</li>
                </ul>
              </div>
              <p className="text-[10px] text-muted-foreground">
                This email exhibits multiple characteristics of a phishing attempt targeting financial credentials.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="headers" className="p-3 pt-2">
            <pre className="text-[10px] text-muted-foreground bg-secondary/30 p-2 rounded-lg overflow-x-auto font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto">
              {headers}
            </pre>
          </TabsContent>

          <TabsContent value="body" className="p-3 pt-2">
            <pre className="text-[10px] text-foreground/80 bg-secondary/30 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-[200px] overflow-y-auto">
              {body}
            </pre>
          </TabsContent>

          <TabsContent value="attachments" className="p-3 pt-2">
            <div className="space-y-2 overflow-hidden">
              {attachments.map((attachment, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg border transition-smooth overflow-hidden",
                    attachment.status === "malicious"
                      ? "bg-danger/10 border-danger/20"
                      : "bg-secondary/30 border-border/50",
                  )}
                >
                  {attachment.type === "pdf" ? (
                    <FileText className="w-6 h-6 text-danger shrink-0" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{attachment.name}</p>
                    <p className="text-[10px] text-muted-foreground">{attachment.size}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] shrink-0 whitespace-nowrap",
                      attachment.status === "malicious"
                        ? "bg-danger/10 text-danger border-danger/30"
                        : "bg-cyber-green/10 text-cyber-green border-cyber-green/30",
                    )}
                  >
                    {attachment.status === "malicious" ? (
                      <>
                        <AlertTriangle className="w-2.5 h-2.5 mr-1" /> Malicious
                      </>
                    ) : (
                      <>
                        <Shield className="w-2.5 h-2.5 mr-1" /> Safe
                      </>
                    )}
                  </Badge>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  )
}
