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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailPreviewDialog } from "@/components/email-preview-dialog";
import { InvestigationCopilot } from "@/components/investigation-copilot";

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

  // UI state
  const [selectedTab, setSelectedTab] = useState("overview");

  // Email preview state
  const [previewEmailId, setPreviewEmailId] = useState<string | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);

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
          const email = await emailRes.json();
          setEmailData(email?.email ?? email);
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

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-neutral-950">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-neutral-400">Loading investigation...</p>
          <p className="text-neutral-500 text-xs mt-2">
            If this takes too long, there may be API connectivity issues
          </p>
        </div>
      </div>
    );
  }

  // Ensure we have at least minimal email data
  if (!emailData) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-neutral-950">
        <div className="text-center max-w-md">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-neutral-200 mb-2">
            Unable to Load Email Data
          </h2>
          <p className="text-neutral-400 mb-4">
            The email data could not be loaded from the server. This may be due to:
          </p>
          <ul className="text-left text-sm text-neutral-500 space-y-1 mb-4">
            <li>• API server connectivity issues</li>
            <li>• Email not found in database</li>
            <li>• Server configuration problems</li>
          </ul>
          <p className="text-xs text-neutral-500 font-mono break-all">
            Email ID: {emailId}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-neutral-950 text-neutral-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-neutral-800 bg-gradient-to-r from-neutral-900 via-neutral-900/95 to-neutral-900/90 backdrop-blur-sm shadow-lg">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-h-0">
              <h1 className="text-xl font-semibold flex items-center gap-2 mb-1">
                <Shield className="w-5 h-5 text-blue-500" />
                Email Security Investigation
              </h1>
              <div className="flex items-center gap-4 text-sm">
                <p className="text-neutral-400 flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  <span className="font-semibold">
                    {emailData?.subject || "No subject"}
                  </span>
                </p>
                <p className="text-neutral-500">â€¢</p>
                <p className="text-neutral-400 font-mono text-xs">
                  {emailData?.sender || "Unknown sender"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {investigation && (
                <>
                  <Badge variant="outline" className="text-xs capitalize">
                    {investigation.status}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs capitalize ${
                      investigation.priority === "critical"
                        ? "border-red-500 text-red-400"
                        : investigation.priority === "high"
                          ? "border-orange-500 text-orange-400"
                          : investigation.priority === "medium"
                            ? "border-yellow-500 text-yellow-400"
                            : "border-green-500 text-green-400"
                    }`}
                  >
                    {investigation.priority}
                  </Badge>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-0 overflow-hidden">
        {/* Left Panel - Email Data */}
        <div className="col-span-7 border-r border-neutral-800 flex flex-col overflow-hidden bg-neutral-950">
          <Tabs
            value={selectedTab}
            onValueChange={setSelectedTab}
            className="flex min-h-0 flex-col"
          >
            <div className="border-b border-neutral-800 px-6 py-3 bg-neutral-900/50">
              <TabsList className="bg-neutral-800/50">
                <TabsTrigger value="overview" className="text-xs">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="content" className="text-xs">
                  Content
                </TabsTrigger>
                <TabsTrigger value="headers" className="text-xs">
                  Headers
                </TabsTrigger>
                <TabsTrigger value="attachments" className="text-xs">
                  Attachments{" "}
                  {emailData?.attachments?.length
                    ? `(${emailData.attachments.length})`
                    : ""}
                </TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-6">
                <TabsContent value="overview" className="mt-0">
                  <div className="space-y-4">
                    <Card className="bg-neutral-900/50 border-neutral-800 shadow-lg">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-neutral-300">
                          Email Metadata
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-neutral-500 text-xs font-medium mb-1">
                              From
                            </p>
                            <p className="font-mono text-neutral-200 text-xs">
                              {emailData?.sender || "N/A"}
                            </p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-neutral-500 text-xs font-medium mb-1">
                              To
                            </p>
                            <p className="font-mono text-neutral-200 text-xs truncate">
                              {emailData?.recipients?.join(", ") || "N/A"}
                            </p>
                          </div>
                          <div className="col-span-3">
                            <p className="text-neutral-500 text-xs font-medium mb-1">
                              Subject
                            </p>
                            <p className="text-neutral-200 text-sm">
                              {emailData?.subject || "N/A"}
                            </p>
                          </div>
                          <div>
                            <p className="text-neutral-500 text-xs font-medium mb-1">
                              Date
                            </p>
                            <p className="text-neutral-200 text-xs">
                              {emailData?.timestamp
                                ? new Date(emailData.timestamp).toLocaleString()
                                : "N/A"}
                            </p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-neutral-500 text-xs font-medium mb-1">
                              Message ID
                            </p>
                            <p className="font-mono text-neutral-400 text-[10px] truncate">
                              {emailData?.messageId || "N/A"}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {investigation && (
                      <Card className="bg-neutral-900/50 border-neutral-800 shadow-lg">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium text-neutral-300">
                            Investigation Details
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <div>
                            <p className="text-neutral-500 text-xs font-medium mb-1">
                              Description
                            </p>
                            <p className="text-neutral-300 text-xs">
                              {investigation.description || "No description"}
                            </p>
                          </div>
                          <div>
                            <p className="text-neutral-500 text-xs font-medium mb-1">
                              Created
                            </p>
                            <p className="text-neutral-300 text-xs">
                              {new Date(
                                investigation.createdAt,
                              ).toLocaleString()}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="content" className="mt-0">
                  <Card className="bg-neutral-900/50 border-neutral-800 shadow-lg">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-neutral-300">
                        Email Body
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-sm whitespace-pre-wrap font-mono text-neutral-300 bg-neutral-950 p-4 rounded-lg">
                        {emailData?.body || "No content"}
                      </pre>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="headers" className="mt-0">
                  <Card className="bg-neutral-900/50 border-neutral-800 shadow-lg">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-neutral-300">
                        Email Headers
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs font-mono whitespace-pre-wrap text-neutral-400 bg-neutral-950 p-4 rounded-lg overflow-x-auto">
                        {emailData?.headers
                          ? JSON.stringify(emailData.headers, null, 2)
                          : "No headers"}
                      </pre>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="attachments" className="mt-0">
                  <Card className="bg-neutral-900/50 border-neutral-800 shadow-lg">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-neutral-300">
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
                              className="text-sm bg-neutral-950 p-3 rounded-lg flex items-center justify-between"
                            >
                              <span className="text-neutral-200">
                                {att.filename}
                              </span>
                              <span className="text-neutral-500 text-xs">
                                {att.size
                                  ? `${(att.size / 1024).toFixed(2)} KB`
                                  : "Unknown size"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-neutral-500">
                          No attachments
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        </div>

        {/* Right Panel - AI Copilot (CopilotKit Style) */}
        <div className="col-span-5 flex min-h-0 flex-col">
          <InvestigationCopilot
            emailId={emailId}
            onEmailClick={handleEmailClick}
            quickActions={QUICK_ACTIONS}
            suggestedQuestions={SUGGESTED_QUESTIONS}
          />
        </div>
      </div>

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
}
