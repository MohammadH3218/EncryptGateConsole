"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Loader2,
  AlertTriangle,
  Shield,
  Mail,
  Copy,
  Send,
  Ban,
  CheckCircle,
  ArrowUp,
  ChevronRight,
  FileText,
  Link as LinkIcon,
  ArrowLeft,
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

// Types
interface Investigation {
  investigationId: string;
  emailMessageId: string;
  status: string;
  priority: string;
  severity?: string;
  description?: string;
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
  attachments?: Array<{ filename: string; size?: number }>;
  direction?: string;
  status?: string;
  size?: number;
  cc?: string[];
  urls?: string[];
  flaggedCategory?: string;
  flaggedSeverity?: string;
}

export default function InvestigationPage() {
  const params = useParams();
  const router = useRouter();
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
      console.log('🔍 Loading investigation data for:', emailId);

      // Load investigation
      try {
        const invRes = await fetch(`/api/investigations?emailMessageId=${encodeURIComponent(emailId)}`);
        if (invRes.ok) {
          const investigations = await invRes.json();
          if (investigations.length > 0) {
            setInvestigation(investigations[0]);
            console.log('✅ Investigation loaded:', investigations[0]);
          }
        }
      } catch (e) {
        console.warn("Failed to load investigation:", e);
      }

      // Load email with proper error handling
      const emailRes = await fetch(`/api/email/${encodeURIComponent(emailId)}`);
      console.log('📧 Email API response status:', emailRes.status);

      if (emailRes.ok) {
        const response = await emailRes.json();
        console.log('📧 Email API response:', response);

        const email = response?.email || response;
        if (email && email.messageId) {
          setEmailData(email);
          console.log('✅ Email data loaded:', email);
        } else {
          console.error('❌ Invalid email data structure:', response);
          setError("Invalid email data format");
        }
      } else {
        const errorData = await emailRes.json();
        console.error('❌ Email API error:', errorData);
        setError(errorData.error || "Failed to load email");
      }
    } catch (err: any) {
      console.error("Failed to load data:", err);
      setError(err.message || "Failed to load investigation data");
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
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-600/20 to-emerald-600/5 border border-emerald-600/20 flex items-center justify-center mx-auto">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
            <div className="absolute inset-0 rounded-full bg-emerald-600/10 animate-ping" style={{ animationDuration: '2s' }} />
          </div>
          <p className="text-slate-300 font-medium mb-2">Loading investigation...</p>
          <p className="text-slate-500 text-sm">Retrieving email data and security analysis</p>
        </div>
      </div>
    );
  }

  if (error || !emailData) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-black">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-600/10 border border-red-600/20 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Unable to Load Email Data</h2>
          <p className="text-slate-400 text-sm mb-4">{error || "The requested email could not be found"}</p>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 mb-4">
            <p className="text-xs text-slate-500 font-mono break-all">{emailId}</p>
          </div>
          <Button
            onClick={() => router.back()}
            variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-900"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-800 bg-gradient-to-r from-slate-950 to-slate-900 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-1.5 rounded-lg bg-emerald-600/10 border border-emerald-600/20">
                <Shield className="w-5 h-5 text-emerald-500" />
              </div>
              <h1 className="text-lg font-semibold text-white">Email Security Investigation</h1>
              {investigation && (
                <>
                  <Badge variant="outline" className="text-xs border-slate-700 text-slate-300 bg-slate-800/50">
                    {investigation.status}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      investigation.priority === "critical"
                        ? "border-red-500 text-red-400 bg-red-900/20"
                        : investigation.priority === "high"
                        ? "border-orange-500 text-orange-400 bg-orange-900/20"
                        : investigation.priority === "medium"
                        ? "border-yellow-500 text-yellow-400 bg-yellow-900/20"
                        : "border-slate-600 text-slate-300 bg-slate-800/50"
                    }`}
                  >
                    {investigation.priority}
                  </Badge>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-emerald-500/70 flex-shrink-0" />
              <span className="text-slate-200 font-medium truncate">{emailData.subject || "No Subject"}</span>
              <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
              <span className="text-slate-400 font-mono text-xs truncate">{emailData.sender}</span>
            </div>
          </div>
          <Button
            onClick={() => setSubmitDialogOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 px-4 shadow-lg shadow-emerald-600/20 transition-all hover:shadow-emerald-600/30 flex-shrink-0 ml-4"
          >
            <Send className="w-4 h-4 mr-2" />
            Submit Investigation
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex">
        {/* Left Panel - Email Details */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-black">
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex-1 flex flex-col min-h-0">
            <div className="border-b border-slate-800 bg-slate-950 px-6">
              <TabsList className="bg-transparent border-0 h-12 gap-1">
                <TabsTrigger
                  value="overview"
                  className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-emerald-500 data-[state=active]:text-white text-slate-400 rounded-none hover:text-slate-200 transition-colors"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="content"
                  className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-emerald-500 data-[state=active]:text-white text-slate-400 rounded-none hover:text-slate-200 transition-colors"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Content
                </TabsTrigger>
                <TabsTrigger
                  value="headers"
                  className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-emerald-500 data-[state=active]:text-white text-slate-400 rounded-none hover:text-slate-200 transition-colors"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Headers
                </TabsTrigger>
                <TabsTrigger
                  value="attachments"
                  className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-emerald-500 data-[state=active]:text-white text-slate-400 rounded-none hover:text-slate-200 transition-colors"
                >
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Attachments {emailData.attachments?.length ? `(${emailData.attachments.length})` : ""}
                </TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6">
                <TabsContent value="overview" className="mt-0 space-y-4">
                  {/* Email Metadata - Two Card Layout */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Card 1: Email Information */}
                    <Card className="bg-[#1a1a1a] border-slate-800">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-white text-base flex items-center gap-2">
                          <Mail className="w-4 h-4 text-emerald-500" />
                          Email Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <label className="text-sm font-medium text-gray-400">Subject</label>
                          <p className="font-medium text-white mt-1 break-words">{emailData.subject || 'No Subject'}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-400">From</label>
                          <p className="font-mono text-sm text-white mt-1 break-all">{emailData.sender}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-400">To</label>
                          <div className="mt-1">
                            {emailData.recipients && emailData.recipients.length > 0 ? (
                              <div className="space-y-1">
                                {emailData.recipients.map((recipient, idx) => (
                                  <p key={idx} className="font-mono text-sm text-white break-all">{recipient}</p>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-400">No recipients</p>
                            )}
                          </div>
                        </div>
                        {emailData.cc && emailData.cc.length > 0 && (
                          <div>
                            <label className="text-sm font-medium text-gray-400">CC</label>
                            <div className="mt-1 space-y-1">
                              {emailData.cc.map((cc, idx) => (
                                <p key={idx} className="font-mono text-sm text-white break-all">{cc}</p>
                              ))}
                            </div>
                          </div>
                        )}
                        <div>
                          <label className="text-sm font-medium text-gray-400">Received</label>
                          <p className="text-sm text-white mt-1">
                            {emailData.timestamp ?
                              (() => {
                                try {
                                  return new Date(emailData.timestamp).toLocaleString();
                                } catch (error) {
                                  return emailData.timestamp;
                                }
                              })()
                              : 'Unknown'
                            }
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Card 2: Status & Security */}
                    <Card className="bg-[#1a1a1a] border-slate-800">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-white text-base flex items-center gap-2">
                          <Shield className="w-4 h-4 text-emerald-500" />
                          Status & Security
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <label className="text-sm font-medium text-gray-400">Direction</label>
                          <div className="mt-1">
                            <Badge
                              variant={emailData.direction === "inbound" ? "secondary" : "outline"}
                              className={emailData.direction === "inbound"
                                ? "bg-blue-900/30 text-blue-300 border-blue-600/30"
                                : "bg-gray-800/50 text-gray-300 border-gray-600/50"
                              }
                            >
                              {emailData.direction || "unknown"}
                            </Badge>
                          </div>
                        </div>
                        {investigation && (
                          <>
                            <div>
                              <label className="text-sm font-medium text-gray-400">Investigation Status</label>
                              <div className="mt-1">
                                <Badge variant="outline" className="border-emerald-600/30 text-emerald-300 bg-emerald-900/20">
                                  {investigation.status}
                                </Badge>
                              </div>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-400">Priority</label>
                              <div className="mt-1">
                                <Badge
                                  variant="outline"
                                  className={
                                    investigation.priority === "critical"
                                      ? "border-red-500 text-red-400 bg-red-900/20"
                                      : investigation.priority === "high"
                                      ? "border-orange-500 text-orange-400 bg-orange-900/20"
                                      : investigation.priority === "medium"
                                      ? "border-yellow-500 text-yellow-400 bg-yellow-900/20"
                                      : "border-slate-600 text-slate-300 bg-slate-800/50"
                                  }
                                >
                                  {investigation.priority}
                                </Badge>
                              </div>
                            </div>
                          </>
                        )}
                        <div>
                          <label className="text-sm font-medium text-gray-400">Status</label>
                          <div className="mt-1">
                            <Badge variant="outline" className="border-slate-700 text-slate-300 bg-slate-800/50">
                              {emailData.status || "unknown"}
                            </Badge>
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-400">Size</label>
                          <p className="text-sm text-white mt-1">
                            {emailData.size ? (emailData.size / 1024).toFixed(1) : '0.0'} KB
                          </p>
                        </div>
                        {emailData.attachments && emailData.attachments.length > 0 && (
                          <div>
                            <label className="text-sm font-medium text-gray-400">Attachments</label>
                            <p className="text-sm text-white mt-1">
                              {emailData.attachments.length} file{emailData.attachments.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        )}
                        {emailData.urls && emailData.urls.length > 0 && (
                          <div>
                            <label className="text-sm font-medium text-gray-400">URLs Found</label>
                            <p className="text-sm text-white mt-1">
                              {emailData.urls.length} URL{emailData.urls.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        )}
                        <div>
                          <label className="text-sm font-medium text-gray-400">Message ID</label>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-400 font-mono break-all flex-1">{emailData.messageId}</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigator.clipboard.writeText(emailData.messageId)}
                              className="text-gray-400 hover:text-white p-1 h-7 w-7 flex-shrink-0"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Investigation Details */}
                  {investigation && investigation.description && (
                    <Card className="bg-[#1a1a1a] border-slate-800">
                      <CardHeader>
                        <CardTitle className="text-base font-semibold text-white">Investigation Notes</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <label className="text-sm font-medium text-gray-400">Description</label>
                          <p className="text-sm text-white mt-1">{investigation.description || "No description"}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-400">Created</label>
                          <p className="text-sm text-white mt-1">{new Date(investigation.createdAt).toLocaleString()}</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="content" className="mt-0">
                  <Card className="bg-[#1a1a1a] border-slate-800">
                    <CardHeader>
                      <CardTitle className="text-base font-semibold text-white">Email Body</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {emailData.htmlBody ? (
                        <div className="bg-black p-4 rounded border border-slate-800 max-h-[600px] overflow-auto">
                          <iframe
                            srcDoc={emailData.htmlBody}
                            className="w-full min-h-[400px] bg-white"
                            title="Email HTML Content"
                            sandbox="allow-same-origin"
                          />
                        </div>
                      ) : (
                        <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono bg-black p-4 rounded border border-slate-800">
                          {emailData.body || "No content"}
                        </pre>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="headers" className="mt-0">
                  <Card className="bg-[#1a1a1a] border-slate-800">
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
                  <Card className="bg-[#1a1a1a] border-slate-800">
                    <CardHeader>
                      <CardTitle className="text-base font-semibold text-white">Attachments</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {emailData.attachments && emailData.attachments.length > 0 ? (
                        <div className="space-y-2">
                          {emailData.attachments.map((att, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between p-3 bg-black rounded border border-slate-800"
                            >
                              <div className="flex items-center gap-3">
                                <FileText className="w-4 h-4 text-slate-400" />
                                <span className="text-sm text-white">{att.filename}</span>
                              </div>
                              {att.size && (
                                <span className="text-xs text-slate-500">
                                  {(att.size / 1024).toFixed(2)} KB
                                </span>
                              )}
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
