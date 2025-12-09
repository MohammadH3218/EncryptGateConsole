"use client";

// app/investigate/[id]/page.tsx - Enhanced full-screen investigation
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  Loader2,
  Sparkles,
  AlertTriangle,
  Shield,
  Users,
  History,
  Mail,
  Clock,
  FileText,
  Activity,
  TrendingUp,
  Copy,
  Send,
  Ban,
  CheckCircle,
  ArrowUp,
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
import { EmailPreviewDialog } from "@/components/email-preview-dialog";
import { InvestigationCopilotPanel } from "@/components/InvestigationCopilotPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";

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
  threatScore?: number;
  riskScore?: number;
  indicators?: string[];
  direction?: string;
  status?: string;
  size?: number;
  flaggedCategory?: string;
  flaggedSeverity?: string;
  investigationStatus?: string;
  flaggedBy?: string;
  flaggedAt?: string;
  detectionId?: string;
  threatLevel?: string;
  cc?: string[];
  urls?: string[];
}

interface TimelineEvent {
  id: string;
  type: "status_change" | "assignment" | "comment" | "detection" | "investigation";
  timestamp: string;
  user?: string;
  description: string;
  metadata?: Record<string, any>;
}


// Quick actions
const QUICK_ACTIONS = [
  {
    id: "initialize",
    label: "Initialize",
    icon: Sparkles,
    pipeline: "initialize",
    description: "Comprehensive multi-step investigation",
  },
  {
    id: "whyFlagged",
    label: "Why Flagged?",
    icon: AlertTriangle,
    pipeline: "whyFlagged",
    description: "Explain detection reasons",
  },
  {
    id: "whoElse",
    label: "Who Else?",
    icon: Users,
    pipeline: "whoElse",
    description: "Analyze recipient patterns",
  },
  {
    id: "senderRisk",
    label: "Sender Risk",
    icon: Shield,
    pipeline: "senderRisk",
    description: "Assess sender reputation",
  },
  {
    id: "similarIncidents",
    label: "Similar Incidents",
    icon: History,
    pipeline: "similarIncidents",
    description: "Find related cases",
  },
];

const SUGGESTED_QUESTIONS = [
  "What URLs are in this email?",
  "Has this sender sent suspicious emails before?",
  "Analyze the recipient list",
  "What's unusual about this email?",
  "Is this part of a larger campaign?",
  "Calculate risk score for this email",
];

export default function EnhancedInvestigationPage() {
  const params = useParams();
  const emailId = decodeURIComponent(params.id as string);

  // Data state
  const [investigation, setInvestigation] = useState<Investigation | null>(
    null,
  );
  const [emailData, setEmailData] = useState<EmailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // UI state
  const [selectedTab, setSelectedTab] = useState("overview");

  // Email preview state
  const [previewEmailId, setPreviewEmailId] = useState<string | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitAction, setSubmitAction] = useState<"block" | "allow" | "push" | null>(null);

  // Load data
  useEffect(() => {
    loadInvestigationData();
  }, [emailId]);


  async function loadInvestigationData() {
    try {
      setLoading(true);

      // Try to load investigation data
      try {
        const invRes = await fetch(
          `/api/investigations?emailMessageId=${encodeURIComponent(emailId)}`,
        );
        if (invRes.ok) {
          const investigations = await invRes.json();
          if (investigations.length > 0) {
            setInvestigation(investigations[0]);
          }
        } else {
          console.warn(`Failed to load investigations: ${invRes.status}`);
        }
      } catch (invError) {
        console.error("Error loading investigations:", invError);
        // Continue even if this fails
      }

      // Try to load email data
      try {
        const emailRes = await fetch(`/api/email/${encodeURIComponent(emailId)}`);
        if (emailRes.ok) {
          const response = await emailRes.json();
          // Handle both response formats: { ok: true, email: {...} } or direct email object
          const email = response?.email || response;
          if (email && email.messageId) {
            setEmailData(email);
          } else {
            console.warn("Invalid email data structure:", response);
          }
        } else {
          console.warn(`Failed to load email: ${emailRes.status}`);
          // Set minimal email data so page can still render
          if (!emailData) {
            setEmailData({
              messageId: emailId,
              subject: "Email data unavailable",
              sender: "Unknown",
              recipients: [],
              timestamp: new Date().toISOString(),
              body: "Email data could not be loaded from the server.",
            });
          }
        }
      } catch (emailError) {
        console.error("Error loading email:", emailError);
        // Set minimal email data so page can still render
        if (!emailData) {
          setEmailData({
            messageId: emailId,
            subject: "Email data unavailable",
            sender: "Unknown",
            recipients: [],
            timestamp: new Date().toISOString(),
            body: "Email data could not be loaded from the server.",
          });
        }
      }

      // Load timeline events
      try {
        const timelineRes = await fetch(`/api/investigation-history/${encodeURIComponent(emailId)}`);
        if (timelineRes.ok) {
          const timelineData = await timelineRes.json();
          // Transform investigation history into timeline events
          if (timelineData.sessions && Array.isArray(timelineData.sessions)) {
            const events: TimelineEvent[] = [];
            timelineData.sessions.forEach((session: any) => {
              if (session.createdAt) {
                events.push({
                  id: `session-${session.sessionId}`,
                  type: "investigation",
                  timestamp: session.createdAt,
                  user: session.userId,
                  description: `Investigation session started`,
                });
              }
              if (session.messages && Array.isArray(session.messages)) {
                session.messages.forEach((msg: any, idx: number) => {
                  if (msg.timestamp) {
                    events.push({
                      id: `msg-${session.sessionId}-${idx}`,
                      type: "comment",
                      timestamp: msg.timestamp,
                      user: msg.role === "user" ? session.userId : "AI",
                      description: msg.role === "user" ? "Analyst question" : "AI response",
                    });
                  }
                });
              }
            });
            // Sort by timestamp
            events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            setTimeline(events);
          }
        }
      } catch (timelineError) {
        console.log("Timeline data not available:", timelineError);
        // Create a default timeline entry
        setTimeline([
          {
            id: "detection-1",
            type: "detection",
            timestamp: new Date().toISOString(),
            description: "Detection created",
          },
        ]);
      }

      setLoading(false);
    } catch (error) {
      console.error("Failed to load investigation:", error);
      // Set minimal data so page can still render
      if (!emailData) {
        setEmailData({
          messageId: emailId,
          subject: "Error loading email",
          sender: "Unknown",
          recipients: [],
          timestamp: new Date().toISOString(),
          body: "An error occurred while loading the email data.",
        });
      }
      setLoading(false);
    }
  }


  function handleEmailClick(emailId: string) {
    setPreviewEmailId(emailId);
    setPreviewDialogOpen(true);
  }

  // Badge helper functions (matching All Emails page)
  const getFlaggedBadge = (category?: string, severity?: string) => {
    if (!category || category === "none" || category === "clean") {
      return <Badge variant="outline" className="border-gray-500/30 text-gray-400">Not Flagged</Badge>;
    }
    const severityColors: Record<string, string> = {
      critical: "bg-red-600 text-white",
      high: "bg-orange-600 text-white",
      medium: "bg-yellow-600 text-white",
      low: "bg-slate-600 text-white",
    };
    const color = severity ? severityColors[severity.toLowerCase()] || "bg-gray-600 text-white" : "bg-gray-600 text-white";
    const label = category === "ai" ? "AI" : category === "manual" ? "Manual" : category;
    return (
      <Badge className={`${color} capitalize`}>
        {label} {severity && `(${severity})`}
      </Badge>
    );
  };

  const getInvestigationBadge = (status?: string) => {
    if (!status) return null;
    switch (status.toLowerCase()) {
      case "new":
        return <Badge variant="destructive" className="bg-red-600"><AlertCircle className="h-3 w-3 mr-1" />New</Badge>;
      case "in_progress":
      case "active":
        return <Badge variant="secondary" className="bg-yellow-600"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
      case "resolved":
        return <Badge variant="outline" className="border-green-500 text-green-500"><CheckCircle className="h-3 w-3 mr-1" />Resolved</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return <Badge variant="secondary">Unknown</Badge>;
    switch (status.toLowerCase()) {
      case "quarantined":
        return <Badge variant="destructive">Quarantined</Badge>;
      case "blocked":
        return <Badge variant="destructive">Blocked</Badge>;
      case "analyzed":
        return <Badge variant="outline">Analyzed</Badge>;
      case "received":
        return <Badge variant="secondary">Received</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950">
        <div className="w-full max-w-4xl px-6">
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // Ensure we have at least minimal email data
  if (!emailData) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950">
        <div className="text-center max-w-md">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-200 mb-2">
            Unable to Load Email Data
          </h2>
          <p className="text-slate-400 mb-4">
            The email data could not be loaded from the server. This may be due to:
          </p>
          <ul className="text-left text-sm text-slate-500 space-y-1 mb-4">
            <li>• API server connectivity issues</li>
            <li>• Email not found in database</li>
            <li>• Server configuration problems</li>
          </ul>
          <p className="text-xs text-slate-500 font-mono break-all">
            Email ID: {emailId}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden" data-investigation-page>
      {/* Header */}
      <motion.div
        className="border-b border-slate-800 bg-slate-900"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-h-0">
              <h1 className="text-xl font-semibold flex items-center gap-2 mb-1">
                <Shield className="w-5 h-5 text-slate-300" />
                Email Security Investigation
              </h1>
              <div className="flex items-center gap-4 text-sm">
                <p className="text-slate-400 flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  <span className="font-semibold">
                    {emailData?.subject || "No subject"}
                  </span>
                </p>
                <p className="text-slate-500">•</p>
                <p className="text-slate-400 font-mono text-xs">
                  {emailData?.sender || "Unknown sender"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {investigation && (
                <>
                  <Badge variant="outline" className="text-xs capitalize border-slate-700 text-slate-300 bg-slate-800/50">
                    {investigation.status}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs capitalize ${
                      investigation.priority === "critical"
                        ? "border-red-500 text-red-400 bg-red-950/20"
                        : investigation.priority === "high"
                          ? "border-orange-500 text-orange-400 bg-orange-950/20"
                          : investigation.priority === "medium"
                            ? "border-yellow-500 text-yellow-400 bg-yellow-950/20"
                            : "border-slate-600 text-slate-300 bg-slate-800/50"
                    }`}
                  >
                    {investigation.priority}
                  </Badge>
                </>
              )}
              <Button
                onClick={() => setSubmitDialogOpen(true)}
                size="default"
                className="bg-emerald-600 hover:bg-emerald-700 text-white transition-all duration-200 h-9 px-4 ml-2"
              >
                <Send className="w-4 h-4 mr-2" />
                Submit Investigation
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex gap-4 px-4 pb-4 pt-2 overflow-hidden">
        {/* Left Panel - Email Data */}
        <motion.section
          className="flex-1 min-w-0 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col overflow-hidden"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Tabs
            value={selectedTab}
            onValueChange={setSelectedTab}
            className="flex min-h-0 flex-col"
          >
            <div className="border-b border-slate-800 px-6 py-3 bg-slate-900/50">
              <TabsList className="bg-slate-800/50 border border-slate-700/50">
                <TabsTrigger 
                  value="overview" 
                  className="text-xs text-slate-400 data-[state=active]:bg-slate-900 data-[state=active]:text-slate-200 data-[state=active]:border-slate-700"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger 
                  value="content" 
                  className="text-xs text-slate-400 data-[state=active]:bg-slate-900 data-[state=active]:text-slate-200 data-[state=active]:border-slate-700"
                >
                  Content
                </TabsTrigger>
                <TabsTrigger 
                  value="headers" 
                  className="text-xs text-slate-400 data-[state=active]:bg-slate-900 data-[state=active]:text-slate-200 data-[state=active]:border-slate-700"
                >
                  Headers
                </TabsTrigger>
                <TabsTrigger 
                  value="attachments" 
                  className="text-xs text-slate-400 data-[state=active]:bg-slate-900 data-[state=active]:text-slate-200 data-[state=active]:border-slate-700"
                >
                  Attachments{" "}
                  {emailData?.attachments?.length
                    ? `(${emailData.attachments.length})`
                    : ""}
                </TabsTrigger>
                <TabsTrigger 
                  value="timeline" 
                  className="text-xs text-slate-400 data-[state=active]:bg-slate-900 data-[state=active]:text-slate-200 data-[state=active]:border-slate-700"
                >
                  Timeline
                </TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-6">
                <AnimatePresence mode="wait">
                  <TabsContent value="overview" className="mt-0" key="overview">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-4"
                    >
                      {/* Risk Score Card */}
                      {(emailData?.threatScore !== undefined || emailData?.riskScore !== undefined) && (
                        <Card className="bg-slate-900/50 border-slate-800">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
                              <TrendingUp className="w-4 h-4" />
                              Risk Assessment
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                              {emailData.threatScore !== undefined && (
                                <div>
                                  <p className="text-slate-500 text-xs font-medium mb-1">Threat Score</p>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full ${
                                          emailData.threatScore >= 80
                                            ? "bg-red-500"
                                            : emailData.threatScore >= 60
                                            ? "bg-orange-500"
                                            : emailData.threatScore >= 40
                                            ? "bg-yellow-500"
                                            : "bg-slate-500"
                                        }`}
                                        style={{ width: `${emailData.threatScore}%` }}
                                      />
                                    </div>
                                    <span className="text-slate-200 text-sm font-semibold">
                                      {emailData.threatScore}
                                    </span>
                                  </div>
                                </div>
                              )}
                              {emailData.riskScore !== undefined && (
                                <div>
                                  <p className="text-slate-500 text-xs font-medium mb-1">Risk Score</p>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full ${
                                          emailData.riskScore >= 80
                                            ? "bg-red-500"
                                            : emailData.riskScore >= 60
                                            ? "bg-orange-500"
                                            : emailData.riskScore >= 40
                                            ? "bg-yellow-500"
                                            : "bg-slate-500"
                                        }`}
                                        style={{ width: `${emailData.riskScore}%` }}
                                      />
                                    </div>
                                    <span className="text-slate-200 text-sm font-semibold">
                                      {emailData.riskScore}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                            {emailData.indicators && emailData.indicators.length > 0 && (
                              <div>
                                <p className="text-slate-500 text-xs font-medium mb-2">Key Indicators</p>
                                <div className="flex flex-wrap gap-2">
                                  {emailData.indicators.map((indicator, i) => (
                                    <Badge
                                      key={i}
                                      variant="outline"
                                      className="text-xs border-orange-500/50 text-orange-400 bg-orange-950/20"
                                    >
                                      {indicator}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      <Card className="bg-slate-900/50 border-slate-800">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium text-slate-300">
                            Email Metadata
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Left Column */}
                            <div className="space-y-4">
                              <div>
                                <label className="text-slate-500 text-xs font-medium block mb-1">
                                  Subject
                                </label>
                                <p className="text-slate-200 text-sm font-medium break-words">
                                  {emailData?.subject || "No Subject"}
                                </p>
                              </div>
                              <div>
                                <label className="text-slate-500 text-xs font-medium block mb-1">
                                  From
                                </label>
                                <p className="font-mono text-slate-200 text-xs break-all">
                                  {emailData?.sender || "Unknown"}
                                </p>
                              </div>
                              <div>
                                <label className="text-slate-500 text-xs font-medium block mb-1">
                                  To
                                </label>
                                <div className="space-y-1">
                                  {emailData?.recipients && emailData.recipients.length > 0 ? (
                                    emailData.recipients.map((recipient: string, idx: number) => (
                                      <p key={idx} className="font-mono text-slate-200 text-xs break-all">
                                        {recipient}
                                      </p>
                                    ))
                                  ) : (
                                    <p className="text-slate-400 text-xs">No recipients</p>
                                  )}
                                </div>
                              </div>
                              {emailData?.cc && emailData.cc.length > 0 && (
                                <div>
                                  <label className="text-slate-500 text-xs font-medium block mb-1">
                                    CC
                                  </label>
                                  <div className="space-y-1">
                                    {emailData.cc.map((cc: string, idx: number) => (
                                      <p key={idx} className="font-mono text-slate-200 text-xs break-all">
                                        {cc}
                                      </p>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div>
                                <label className="text-slate-500 text-xs font-medium block mb-1">
                                  Received
                                </label>
                                <p className="text-slate-200 text-xs">
                                  {emailData?.timestamp
                                    ? (() => {
                                        try {
                                          return new Date(emailData.timestamp).toLocaleString();
                                        } catch {
                                          return emailData.timestamp;
                                        }
                                      })()
                                    : "Unknown"}
                                </p>
                              </div>
                            </div>

                            {/* Right Column */}
                            <div className="space-y-4">
                              <div>
                                <label className="text-slate-500 text-xs font-medium block mb-1">
                                  Direction
                                </label>
                                <Badge
                                  variant="outline"
                                  className={
                                    emailData?.direction === "inbound"
                                      ? "bg-slate-800/50 text-slate-300 border-slate-600/50"
                                      : "bg-gray-800/50 text-gray-300 border-gray-600/50"
                                  }
                                >
                                  {emailData?.direction || "unknown"}
                                </Badge>
                              </div>
                              <div>
                                <label className="text-slate-500 text-xs font-medium block mb-1">
                                  Status
                                </label>
                                <Badge
                                  variant="outline"
                                  className="bg-slate-800/50 text-slate-300 border-slate-600/50"
                                >
                                  {emailData?.status || "unknown"}
                                </Badge>
                              </div>
                              {emailData?.size !== undefined && (
                                <div>
                                  <label className="text-slate-500 text-xs font-medium block mb-1">
                                    Size
                                  </label>
                                  <p className="text-slate-200 text-xs">
                                    {typeof emailData.size === 'number' 
                                      ? `${(emailData.size / 1024).toFixed(1)} KB`
                                      : emailData.size}
                                  </p>
                                </div>
                              )}
                              {emailData?.attachments && emailData.attachments.length > 0 && (
                                <div>
                                  <label className="text-slate-500 text-xs font-medium block mb-1">
                                    Attachments
                                  </label>
                                  <p className="text-slate-200 text-xs">
                                    {emailData.attachments.length} file{emailData.attachments.length !== 1 ? 's' : ''}
                                  </p>
                                </div>
                              )}
                              {emailData?.urls && emailData.urls.length > 0 && (
                                <div>
                                  <label className="text-slate-500 text-xs font-medium block mb-1">
                                    URLs
                                  </label>
                                  <p className="text-slate-200 text-xs">
                                    {emailData.urls.length} URL{emailData.urls.length !== 1 ? 's' : ''} found
                                  </p>
                                </div>
                              )}
                              <div>
                                <label className="text-slate-500 text-xs font-medium block mb-1">
                                  Message ID
                                </label>
                                <div className="flex items-center gap-2">
                                  <p className="font-mono text-slate-400 text-[10px] break-all flex-1">
                                    {emailData?.messageId || "N/A"}
                                  </p>
                                  {emailData?.messageId && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        navigator.clipboard.writeText(emailData.messageId);
                                      }}
                                      className="text-slate-400 hover:text-slate-200 p-1 h-6 w-6"
                                      title="Copy Message ID"
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                    {investigation && (
                      <Card className="bg-slate-900/50 border-slate-800">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium text-slate-300">
                            Investigation Details
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <div>
                            <p className="text-slate-500 text-xs font-medium mb-1">
                              Description
                            </p>
                            <p className="text-slate-300 text-xs">
                              {investigation.description || "No description"}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs font-medium mb-1">
                              Created
                            </p>
                            <p className="text-slate-300 text-xs">
                              {new Date(
                                investigation.createdAt,
                              ).toLocaleString()}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    </motion.div>
                  </TabsContent>

                  <TabsContent value="content" className="mt-0" key="content">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-slate-300">
                        Email Body
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-sm whitespace-pre-wrap font-mono text-slate-300 bg-slate-950 p-4 rounded-lg">
                        {emailData?.body || "No content"}
                      </pre>
                    </CardContent>
                  </Card>
                    </motion.div>
                  </TabsContent>

                  <TabsContent value="headers" className="mt-0" key="headers">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-slate-300">
                        Email Headers
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs font-mono whitespace-pre-wrap text-slate-400 bg-slate-950 p-4 rounded-lg overflow-x-auto">
                        {emailData?.headers
                          ? JSON.stringify(emailData.headers, null, 2)
                          : "No headers"}
                      </pre>
                    </CardContent>
                  </Card>
                    </motion.div>
                  </TabsContent>

                  <TabsContent value="attachments" className="mt-0" key="attachments">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                  <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-slate-300">
                        Attachments
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {emailData?.attachments &&
                      emailData.attachments.length > 0 ? (
                        <ul className="space-y-2">
                          {emailData.attachments.map((att: any, i: number) => (
                            <li
                              key={i}
                              className="text-sm bg-slate-950 p-3 rounded-lg flex items-center justify-between"
                            >
                              <span className="text-slate-200">
                                {att.filename}
                              </span>
                              <span className="text-slate-500 text-xs">
                                {att.size
                                  ? `${(att.size / 1024).toFixed(2)} KB`
                                  : "Unknown size"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-slate-500">
                          No attachments
                        </p>
                      )}
                    </CardContent>
                  </Card>
                    </motion.div>
                  </TabsContent>

                  <TabsContent value="timeline" className="mt-0" key="timeline">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Card className="bg-slate-900/50 border-slate-800">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            Investigation Timeline
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {timeline.length > 0 ? (
                            <div className="space-y-4">
                              {timeline.map((event, index) => (
                                <motion.div
                                  key={event.id}
                                  initial={{ opacity: 0, x: -20 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: index * 0.05 }}
                                  className="flex gap-4 relative"
                                >
                                  <div className="flex flex-col items-center">
                                    <div className={`w-2 h-2 rounded-full ${
                                      event.type === "detection" ? "bg-red-500" :
                                      event.type === "status_change" ? "bg-slate-500" :
                                      event.type === "assignment" ? "bg-purple-500" :
                                      event.type === "comment" ? "bg-yellow-500" :
                                      "bg-slate-500"
                                    }`} />
                                    {index < timeline.length - 1 && (
                                      <div className="w-px h-full bg-slate-700 mt-2" />
                                    )}
                                  </div>
                                  <div className="flex-1 pb-4">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs font-medium text-slate-300">
                                        {event.type === "detection" && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                                        {event.type === "status_change" && <Activity className="w-3 h-3 inline mr-1" />}
                                        {event.type === "assignment" && <Users className="w-3 h-3 inline mr-1" />}
                                        {event.type === "comment" && <FileText className="w-3 h-3 inline mr-1" />}
                                        {event.description}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-slate-500">
                                      <span>{new Date(event.timestamp).toLocaleString()}</span>
                                      {event.user && (
                                        <>
                                          <span>•</span>
                                          <span>{event.user}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </motion.div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-8 text-slate-500">
                              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">No timeline events yet</p>
                              <p className="text-xs mt-1">Timeline will show status changes, assignments, and comments</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  </TabsContent>
                </AnimatePresence>
              </div>
            </ScrollArea>
          </Tabs>
        </motion.section>

        {/* Right Panel - Copilot */}
        <section className="w-[420px] flex-shrink-0">
          <InvestigationCopilotPanel
            investigationId={investigation?.investigationId || emailId}
            emailId={emailId}
          />
        </section>
      </div>

      {/* Submit Button - In header area */}

      {/* Submit Action Dialog */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              Submit Investigation
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Choose an action for this email investigation
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 py-4">
            <Button
              onClick={() => handleSubmitAction("block")}
              disabled={submitting}
              className="w-full justify-start bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 h-auto py-4"
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
              className="w-full justify-start bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/30 h-auto py-4"
            >
              <CheckCircle className="w-5 h-5 mr-3" />
              <div className="flex-1 text-left">
                <div className="font-semibold">Allow Email</div>
                <div className="text-xs text-green-300/70 mt-1">
                  Mark this specific email as allowed (email only, not sender)
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

      {/* Email Preview Dialog */}
      <EmailPreviewDialog
        emailId={previewEmailId}
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        onInvestigate={(id) => {
          window.open(`/investigate/${encodeURIComponent(id)}`, "_blank");
        }}
      />
    </div>
  );

  // Handle submit action
  async function handleSubmitAction(action: "block" | "allow" | "push") {
    if (!emailData?.messageId) {
      setError("Email message ID is required");
      return;
    }

    setSubmitting(true);
    setSubmitAction(action);

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
            detectionId: investigation?.detectionId,
            investigationId: investigation?.investigationId,
            reason: "Pushed from investigation",
            priority: investigation?.priority || "medium",
          }),
        });
      }

      if (response && response.ok) {
        const result = await response.json();
        console.log(`✅ ${action} action completed:`, result);
        
        // Show success message
        setSuccessMessage(`Successfully ${action === "block" ? "blocked" : action === "allow" ? "allowed" : "pushed"} email`);
        
        // Close dialog
        setSubmitDialogOpen(false);
        
        // If push, navigate to pushed requests page
        if (action === "push") {
          // Try to get orgId from pathname
          const pathname = window.location.pathname;
          const orgMatch = pathname.match(/\/o\/([^/]+)/);
          const orgId = orgMatch ? orgMatch[1] : null;
          if (!orgId) {
            // Fallback: just reload if no orgId found
            setTimeout(() => {
              window.location.reload();
            }, 1500);
            return;
          }
          setTimeout(() => {
            window.location.href = `/o/${orgId}/admin/pushed-requests`;
          }, 1500);
        } else {
          // Refresh page data
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      } else {
        const errorData = await response?.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `Failed to ${action} email`);
      }
    } catch (err: any) {
      console.error(`❌ Failed to ${action} email:`, err);
      setError(err.message || `Failed to ${action} email`);
    } finally {
      setSubmitting(false);
      setSubmitAction(null);
    }
  }
}
