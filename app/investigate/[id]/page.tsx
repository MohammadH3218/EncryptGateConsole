"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  Loader2,
  AlertTriangle,
  Shield,
  Mail,
  Clock,
  Copy,
  Send,
  Ban,
  CheckCircle,
  ArrowUp,
  ChevronRight,
  FileText,
  Link as LinkIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InvestigationCopilotPanel } from "@/components/InvestigationCopilotPanel";
import { Skeleton } from "@/components/ui/skeleton";

// Types
interface Investigation {
  investigationId: string;
  emailMessageId: string;
  status: string;
  priority: string;
  severity: string;
  description: string;
  createdAt: string;
}

interface EmailData {
  messageId: string;
  subject: string;
  sender: string;
  recipients: string[];
  timestamp: string;
  body: string;
  htmlBody?: string;
  headers?: Record<string, string>;
  attachments?: any[];
  direction?: string;
  status?: string;
  size?: number;
  cc?: string[];
  urls?: string[];
}

export default function InvestigationPage() {
  const params = useParams();
  const emailId = decodeURIComponent(params.id as string);

  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [emailData, setEmailData] = useState<EmailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState("overview");
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [emailId]);

  async function loadData() {
    try {
      setLoading(true);

      // Load investigation
      try {
        const invRes = await fetch(`/api/investigations?emailMessageId=${encodeURIComponent(emailId)}`);
        if (invRes.ok) {
          const investigations = await invRes.json();
          if (investigations.length > 0) {
            setInvestigation(investigations[0]);
          }
        }
      } catch (e) {
        console.warn("Failed to load investigation:", e);
      }

      // Load email
      const emailRes = await fetch(`/api/email/${encodeURIComponent(emailId)}`);
      if (emailRes.ok) {
        const response = await emailRes.json();
        const email = response?.email || response;
        if (email && email.messageId) {
          setEmailData(email);
        } else {
          setEmailData({
            messageId: emailId,
            subject: "Email data unavailable",
            sender: "Unknown",
            recipients: [],
            timestamp: new Date().toISOString(),
            body: "Email data could not be loaded.",
          });
        }
      } else {
        setEmailData({
          messageId: emailId,
          subject: "Email data unavailable",
          sender: "Unknown",
          recipients: [],
          timestamp: new Date().toISOString(),
          body: "Email data could not be loaded.",
        });
      }
    } catch (err) {
      console.error("Failed to load data:", err);
      setError("Failed to load investigation data");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitAction(action: "block" | "allow" | "push") {
    if (!emailData?.messageId) return;

    setSubmitting(true);
    try {
      let response;

      if (action === "block") {
        response = await fetch(`/api/email/${encodeURIComponent(emailData.messageId)}/block`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageId: emailData.messageId,
            sender: emailData.sender,
            reason: "Blocked from investigation",
          }),
        });
      } else if (action === "allow") {
        response = await fetch(`/api/email/${encodeURIComponent(emailData.messageId)}/allow`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageId: emailData.messageId,
            reason: "Allowed from investigation",
          }),
        });
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
        });
      }

      if (response && response.ok) {
        setSubmitDialogOpen(false);
        setTimeout(() => window.location.reload(), 1000);
      } else {
        throw new Error(`Failed to ${action} email`);
      }
    } catch (err: any) {
      console.error(`Failed to ${action}:`, err);
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Loading investigation...</p>
        </div>
      </div>
    );
  }

  if (!emailData) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-black">
        <div className="text-center max-w-md">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Unable to Load Email Data</h2>
          <p className="text-slate-400">Email ID: {emailId}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-950 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Shield className="w-5 h-5 text-slate-400" />
              <h1 className="text-lg font-semibold text-white">Email Security Investigation</h1>
              {investigation && (
                <>
                  <Badge variant="outline" className="text-xs border-slate-700 text-slate-300">
                    {investigation.status}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      investigation.priority === "critical"
                        ? "border-red-500 text-red-400"
                        : investigation.priority === "high"
                        ? "border-orange-500 text-orange-400"
                        : investigation.priority === "medium"
                        ? "border-yellow-500 text-yellow-400"
                        : "border-slate-600 text-slate-300"
                    }`}
                  >
                    {investigation.priority}
                  </Badge>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-slate-500" />
              <span className="text-slate-300 font-medium">{emailData.subject}</span>
              <ChevronRight className="w-4 h-4 text-slate-600" />
              <span className="text-slate-500 font-mono text-xs">{emailData.sender}</span>
            </div>
          </div>
          <Button
            onClick={() => setSubmitDialogOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 px-4"
          >
            <Send className="w-4 h-4 mr-2" />
            Submit Investigation
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex">
        {/* Left Panel - Email Details */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex-1 flex flex-col min-h-0">
            <div className="border-b border-slate-800 bg-slate-950 px-6">
              <TabsList className="bg-transparent border-0 h-12">
                <TabsTrigger
                  value="overview"
                  className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-emerald-500 data-[state=active]:text-white text-slate-400 rounded-none"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="content"
                  className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-emerald-500 data-[state=active]:text-white text-slate-400 rounded-none"
                >
                  Content
                </TabsTrigger>
                <TabsTrigger
                  value="headers"
                  className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-emerald-500 data-[state=active]:text-white text-slate-400 rounded-none"
                >
                  Headers
                </TabsTrigger>
                <TabsTrigger
                  value="attachments"
                  className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-emerald-500 data-[state=active]:text-white text-slate-400 rounded-none"
                >
                  Attachments {emailData.attachments?.length ? `(${emailData.attachments.length})` : ""}
                </TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6">
                <TabsContent value="overview" className="mt-0 space-y-4">
                  {/* Email Metadata */}
                  <Card className="bg-slate-950 border-slate-800">
                    <CardHeader>
                      <CardTitle className="text-base font-semibold text-white">Email Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div>
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Subject</label>
                            <p className="text-sm text-white mt-1">{emailData.subject}</p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">From</label>
                            <p className="text-sm text-white mt-1 font-mono">{emailData.sender}</p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">To</label>
                            <div className="mt-1 space-y-1">
                              {emailData.recipients && emailData.recipients.length > 0 ? (
                                emailData.recipients.map((recipient, idx) => (
                                  <p key={idx} className="text-sm text-white font-mono">{recipient}</p>
                                ))
                              ) : (
                                <p className="text-sm text-slate-500">No recipients</p>
                              )}
                            </div>
                          </div>
                          {emailData.cc && emailData.cc.length > 0 && (
                            <div>
                              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">CC</label>
                              <div className="mt-1 space-y-1">
                                {emailData.cc.map((cc, idx) => (
                                  <p key={idx} className="text-sm text-white font-mono">{cc}</p>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Received</label>
                            <p className="text-sm text-white mt-1">
                              {emailData.timestamp ? new Date(emailData.timestamp).toLocaleString() : "Unknown"}
                            </p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Direction</label>
                            <Badge variant="outline" className="mt-1 text-xs border-slate-700 text-slate-300">
                              {emailData.direction || "unknown"}
                            </Badge>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Status</label>
                            <Badge variant="outline" className="mt-1 text-xs border-slate-700 text-slate-300">
                              {emailData.status || "unknown"}
                            </Badge>
                          </div>
                          {emailData.size && (
                            <div>
                              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Size</label>
                              <p className="text-sm text-white mt-1">
                                {typeof emailData.size === 'number' ? `${(emailData.size / 1024).toFixed(1)} KB` : emailData.size}
                              </p>
                            </div>
                          )}
                          {emailData.attachments && emailData.attachments.length > 0 && (
                            <div>
                              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Attachments</label>
                              <p className="text-sm text-white mt-1">
                                {emailData.attachments.length} file{emailData.attachments.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                          )}
                          {emailData.urls && emailData.urls.length > 0 && (
                            <div>
                              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">URLs Found</label>
                              <p className="text-sm text-white mt-1">
                                {emailData.urls.length} URL{emailData.urls.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                          )}
                          <div>
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Message ID</label>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-xs text-slate-400 font-mono truncate flex-1">{emailData.messageId}</p>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigator.clipboard.writeText(emailData.messageId)}
                                className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Investigation Details */}
                  {investigation && (
                    <Card className="bg-slate-950 border-slate-800">
                      <CardHeader>
                        <CardTitle className="text-base font-semibold text-white">Investigation Info</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Description</label>
                          <p className="text-sm text-white mt-1">{investigation.description || "No description"}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Created</label>
                          <p className="text-sm text-white mt-1">{new Date(investigation.createdAt).toLocaleString()}</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="content" className="mt-0">
                  <Card className="bg-slate-950 border-slate-800">
                    <CardHeader>
                      <CardTitle className="text-base font-semibold text-white">Email Body</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono bg-black p-4 rounded border border-slate-800">
                        {emailData.body || "No content"}
                      </pre>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="headers" className="mt-0">
                  <Card className="bg-slate-950 border-slate-800">
                    <CardHeader>
                      <CardTitle className="text-base font-semibold text-white">Email Headers</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs text-slate-400 whitespace-pre-wrap font-mono bg-black p-4 rounded border border-slate-800 overflow-x-auto">
                        {emailData.headers ? JSON.stringify(emailData.headers, null, 2) : "No headers"}
                      </pre>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="attachments" className="mt-0">
                  <Card className="bg-slate-950 border-slate-800">
                    <CardHeader>
                      <CardTitle className="text-base font-semibold text-white">Attachments</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {emailData.attachments && emailData.attachments.length > 0 ? (
                        <div className="space-y-2">
                          {emailData.attachments.map((att: any, i: number) => (
                            <div
                              key={i}
                              className="flex items-center justify-between p-3 bg-black rounded border border-slate-800"
                            >
                              <div className="flex items-center gap-3">
                                <FileText className="w-4 h-4 text-slate-400" />
                                <span className="text-sm text-white">{att.filename}</span>
                              </div>
                              <span className="text-xs text-slate-500">
                                {att.size ? `${(att.size / 1024).toFixed(2)} KB` : "Unknown size"}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">No attachments</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        </div>

        {/* Right Panel - AI Assistant */}
        <div className="w-[420px] border-l border-slate-800 bg-slate-950 flex-shrink-0">
          <InvestigationCopilotPanel
            investigationId={investigation?.investigationId || emailId}
            emailId={emailId}
          />
        </div>
      </div>

      {/* Submit Dialog */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">Submit Investigation</DialogTitle>
            <DialogDescription className="text-slate-400">
              Choose an action for this email investigation
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            <Button
              onClick={() => handleSubmitAction("block")}
              disabled={submitting}
              className="w-full justify-start bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-600/30 h-auto py-4"
            >
              <Ban className="w-5 h-5 mr-3" />
              <div className="flex-1 text-left">
                <div className="font-semibold">Block Email</div>
                <div className="text-xs text-red-300/70 mt-1">
                  Block this email and sender from future delivery
                </div>
              </div>
            </Button>

            <Button
              onClick={() => handleSubmitAction("allow")}
              disabled={submitting}
              className="w-full justify-start bg-green-600/10 hover:bg-green-600/20 text-green-400 border border-green-600/30 h-auto py-4"
            >
              <CheckCircle className="w-5 h-5 mr-3" />
              <div className="flex-1 text-left">
                <div className="font-semibold">Allow Email</div>
                <div className="text-xs text-green-300/70 mt-1">
                  Mark this email as safe
                </div>
              </div>
            </Button>

            <Button
              onClick={() => handleSubmitAction("push")}
              disabled={submitting}
              className="w-full justify-start bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 border border-slate-600/50 h-auto py-4"
            >
              <ArrowUp className="w-5 h-5 mr-3" />
              <div className="flex-1 text-left">
                <div className="font-semibold">Push to Admin</div>
                <div className="text-xs text-slate-400 mt-1">
                  Escalate this investigation to admin review
                </div>
              </div>
            </Button>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setSubmitDialogOpen(false)}
              disabled={submitting}
              className="text-slate-400 hover:text-white"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
