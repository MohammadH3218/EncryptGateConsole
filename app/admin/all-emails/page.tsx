// app/admin/all-emails/page.tsx - UPDATED VERSION
"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import {
  Mail,
  AlertTriangle,
  Shield,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Activity,
  Database,
  Wifi,
  Users,
  Flag,
  CheckCircle,
  Info,
  Clock,
  AlertCircle
} from "lucide-react"

interface Email {
  id: string
  messageId: string
  subject: string
  sender: string
  recipients: string[]
  timestamp: string
  body: string
  bodyHtml?: string
  status: string
  threatLevel: "none" | "low" | "medium" | "high" | "critical"
  isPhishing: boolean
  attachments: string[]
  headers: Record<string, string>
  direction: "inbound" | "outbound"
  size: number
  urls?: string[]
  
  // NEW ATTRIBUTES
  flaggedCategory: "none" | "ai" | "manual" | "clean"
  flaggedSeverity?: "critical" | "high" | "medium" | "low"
  investigationStatus?: "new" | "in_progress" | "resolved"
  detectionId?: string
  flaggedAt?: string
  flaggedBy?: string
  investigationNotes?: string
  updatedAt?: string
}

interface EmailsResponse {
  emails: Email[]
  lastKey: string | null
  hasMore: boolean
  message?: string
  debug?: {
    orgId: string
    tableName: string
    totalItems?: number
    scannedCount?: number
    itemCount?: number
  }
}

export default function AdminAllEmailsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const employeeFilter = searchParams.get("employee") || ""

  // State
  const [emails, setEmails] = useState<Email[]>([])
  const [filteredEmails, setFilteredEmails] = useState<Email[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [directionFilter, setDirectionFilter] = useState("all")
  const [threatFilter, setThreatFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [flaggedFilter, setFlaggedFilter] = useState("all") // NEW: Filter by flagged category
  const [investigationFilter, setInvestigationFilter] = useState("all") // NEW: Filter by investigation status

  // Loading & pagination
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [lastKey, setLastKey] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const ITEMS_PER_PAGE = 25

  // Email viewing & flagging
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [flaggingEmail, setFlaggingEmail] = useState<string | null>(null)
  const [unflaggingEmail, setUnflaggingEmail] = useState<string | null>(null)
  
  // Success/info messages
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  // Handle keyboard shortcuts for email viewer
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedEmail) {
        setSelectedEmail(null);
      }
    };

    if (selectedEmail) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [selectedEmail]);

  // Clear messages after some time
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  useEffect(() => {
    if (infoMessage) {
      const timer = setTimeout(() => setInfoMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [infoMessage])

  // Fetch emails
  const loadEmails = useCallback(
    async (reset = false) => {
      const isInitialLoad = reset;
      isInitialLoad ? setLoading(true) : setLoadingMore(true);
      setError(null);

      console.log('📧 Loading emails...', { 
        reset, 
        currentCount: emails.length, 
        lastKey: reset ? null : lastKey 
      });

      try {
        const params = new URLSearchParams({ limit: ITEMS_PER_PAGE.toString() });
        if (!reset && lastKey) {
          params.set("lastKey", lastKey);
          console.log('⏭️ Using pagination with lastKey');
        }

        const apiUrl = `/api/email?${params}`;
        console.log('🔗 Fetching from:', apiUrl);

        const res = await fetch(apiUrl);
        console.log('📡 API Response status:', res.status);

        if (!res.ok) {
          const errorText = await res.text();
          console.error('❌ API Error Response:', errorText);
          throw new Error(`HTTP ${res.status}: ${errorText}`);
        }

        const data: EmailsResponse = await res.json();
        console.log('📊 API Response data:', {
          emailCount: data.emails?.length || 0,
          hasMore: data.hasMore,
          message: data.message,
          debug: data.debug
        });

        setDebugInfo(data.debug);

        if (data.emails && data.emails.length > 0) {
          console.log('📋 Sample emails received:', data.emails.slice(0, 3).map(e => ({
            id: e.id,
            subject: e.subject,
            sender: e.sender,
            timestamp: e.timestamp,
            flaggedCategory: e.flaggedCategory,
            flaggedSeverity: e.flaggedSeverity,
            investigationStatus: e.investigationStatus,
            bodyExists: !!e.body,
            bodyLength: e.body?.length || 0,
            bodyHtmlExists: !!e.bodyHtml,
            bodyHtmlLength: e.bodyHtml?.length || 0,
            firstBodyChars: e.body ? e.body.substring(0, 100) + '...' : 'NO BODY'
          })));
          
          // Check all emails for body content
          const emailsWithBody = data.emails.filter(e => e.body && e.body.trim().length > 0);
          const emailsWithHtml = data.emails.filter(e => e.bodyHtml && e.bodyHtml.trim().length > 0);
          console.log('📊 Body content analysis:', {
            totalEmails: data.emails.length,
            emailsWithBody: emailsWithBody.length,
            emailsWithHtml: emailsWithHtml.length,
            emailsWithoutBody: data.emails.length - emailsWithBody.length
          });
        } else {
          console.log('ℹ️ No emails in response');
        }

        setEmails(prev => (reset ? data.emails : [...prev, ...data.emails]));
        setLastKey(data.lastKey);
        setHasMore(data.hasMore);

        console.log('✅ Emails loaded successfully:', {
          totalEmails: reset ? data.emails.length : emails.length + data.emails.length,
          hasMore: data.hasMore
        });

      } catch (e: any) {
        console.error("❌ loadEmails error details:", {
          message: e.message,
          stack: e.stack?.split('\n').slice(0, 3)
        });
        setError(e.message || "Failed to load emails");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [lastKey, emails.length]
  );

  // Initial load
  useEffect(() => {
    console.log('🚀 All Emails page mounted, loading initial data...');
    loadEmails(true);
  }, []);

  // Infinite scroll
  useEffect(() => {
    const onScroll = () => {
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 300
      ) {
        if (hasMore && !loading && !loadingMore) {
          console.log('📜 Infinite scroll triggered');
          loadEmails(false);
        }
      }
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [hasMore, loading, loadingMore, loadEmails]);

  // Apply filters - UPDATED to include new filters
  useEffect(() => {
    console.log('🔍 Applying filters...', {
      searchQuery,
      employeeFilter,
      directionFilter,
      threatFilter,
      statusFilter,
      flaggedFilter,
      investigationFilter,
      totalEmails: emails.length
    });

    let list = [...emails];

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(e =>
        e.subject.toLowerCase().includes(q) ||
        e.sender.toLowerCase().includes(q) ||
        e.recipients.some(r => r.toLowerCase().includes(q)) ||
        e.body.toLowerCase().includes(q)
      );
    }

    // Employee filter
    if (employeeFilter) {
      const f = employeeFilter.toLowerCase();
      list = list.filter(e =>
        e.sender.toLowerCase().includes(f) ||
        e.recipients.some(r => r.toLowerCase().includes(f))
      );
    }

    // Direction filter
    if (directionFilter !== "all") {
      list = list.filter(e => e.direction === directionFilter);
    }

    // Threat filter
    if (threatFilter !== "all") {
      if (threatFilter === "threats") {
        list = list.filter(e => e.threatLevel !== "none");
      } else {
        list = list.filter(e => e.threatLevel === threatFilter);
      }
    }

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter(e => e.status === statusFilter);
    }

    // NEW: Flagged category filter
    if (flaggedFilter !== "all") {
      list = list.filter(e => e.flaggedCategory === flaggedFilter);
    }

    // NEW: Investigation status filter
    if (investigationFilter !== "all") {
      list = list.filter(e => e.investigationStatus === investigationFilter);
    }

    console.log('✅ Filters applied:', {
      originalCount: emails.length,
      filteredCount: list.length
    });

    setFilteredEmails(list);
  }, [
    emails,
    searchQuery,
    employeeFilter,
    directionFilter,
    threatFilter,
    statusFilter,
    flaggedFilter,
    investigationFilter
  ]);

  // Badge renderers - UPDATED
  const getFlaggedBadge = (category: string, severity?: string) => {
    switch (category) {
      case "manual":
        return (
          <Badge variant="destructive" className="bg-orange-600">
            Manual {severity && `(${severity.charAt(0).toUpperCase()}${severity.slice(1)})`}
          </Badge>
        );
      case "ai":
        return (
          <Badge variant="destructive" className="bg-purple-600">
            AI {severity && `(${severity.charAt(0).toUpperCase()}${severity.slice(1)})`}
          </Badge>
        );
      case "clean":
        return <Badge variant="outline" className="border-green-500 text-green-500">Clean</Badge>;
      default:
        return <Badge variant="outline" className="border-gray-500 text-gray-500">None</Badge>;
    }
  };

  const getInvestigationBadge = (status?: string) => {
    if (!status) return null;
    
    switch (status) {
      case "new":
        return <Badge variant="destructive" className="bg-red-600"><AlertCircle className="h-3 w-3 mr-1" />New</Badge>;
      case "in_progress":
        return <Badge variant="secondary" className="bg-yellow-600"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
      case "resolved":
        return <Badge variant="outline" className="border-green-500 text-green-500"><CheckCircle className="h-3 w-3 mr-1" />Resolved</Badge>;
      default:
        return null;
    }
  };

  const getThreatBadge = (lvl: string, phish: boolean) => {
    if (phish) {
      return <Badge variant="destructive">Phishing</Badge>;
    }
    switch (lvl) {
      case "critical":
        return <Badge variant="destructive">Critical</Badge>;
      case "high":
        return <Badge variant="destructive">High</Badge>;
      case "medium":
        return <Badge variant="outline">Medium</Badge>;
      case "low":
        return <Badge variant="outline">Low</Badge>;
      default:
        return <Badge variant="outline">Clean</Badge>;
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case "quarantined":
        return <Badge variant="destructive">Quarantined</Badge>;
      case "blocked":
        return <Badge variant="destructive">Blocked</Badge>;
      case "analyzed":
        return <Badge variant="outline">Analyzed</Badge>;
      default:
        return <Badge variant="secondary">Received</Badge>;
    }
  };

  const refreshEmails = () => {
    console.log('🔄 Manual refresh triggered');
    loadEmails(true);
  };

  const viewEmail = (email: Email) => {
    console.log('👁️ Viewing email:', email.id);
    console.log('📧 Full email object:', email);
    console.log('📧 Email body content:', {
      bodyExists: !!email.body,
      bodyLength: email.body?.length || 0,
      bodyContent: email.body,
      bodyHtmlExists: !!email.bodyHtml,
      bodyHtmlLength: email.bodyHtml?.length || 0,
      bodyHtmlContent: email.bodyHtml,
      messageId: email.messageId,
      subject: email.subject
    });
    setSelectedEmail(email);
  };

  const flagEmail = async (email: Email) => {
    console.log('🚩 Flagging email as suspicious:', email.id);
    setFlaggingEmail(email.id);
    setError(null);
    setSuccessMessage(null);
    setInfoMessage(null);

    try {
      // Check if email is already flagged (excluding clean status)
      if (email.flaggedCategory === 'manual' || email.flaggedCategory === 'ai') {
        setInfoMessage(`This email is already flagged as "${email.flaggedCategory}". You can view it in the Detections page.`);
        return;
      }
      
      const flagPayload = {
        emailMessageId: email.messageId,
        emailId: email.id,
        severity: 'medium',
        name: 'Manually Flagged Email',
        description: 'This email was manually flagged as suspicious by a security analyst.',
        indicators: ['Manual review required', 'Flagged by analyst'],
        recommendations: ['Investigate email content', 'Check sender reputation', 'Verify with recipient'],
        threatScore: 75,
        confidence: 90,
        sentBy: email.sender,
        manualFlag: true
      };

      const response = await fetch('/api/detections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(flagPayload),
      });

      if (!response.ok) {
        throw new Error(`Failed to flag email: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Detection created successfully:', result);

      // Update email status in database
      const updatePayload = {
        flaggedCategory: 'manual',
        flaggedSeverity: 'medium',
        investigationStatus: 'new',
        detectionId: result.detectionId || 'manual-' + Date.now(),
        flaggedBy: 'Security Analyst'
      };

      const emailUpdateResponse = await fetch(`/api/email/${email.messageId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      });

      if (!emailUpdateResponse.ok) {
        const errorData = await emailUpdateResponse.json();
        console.warn('⚠️ Failed to update email status in database:', errorData);
        // Don't throw error here - the detection was created successfully
        setSuccessMessage('Email flagged successfully! Detection has been created. Note: Email status update in database failed.');
      } else {
        console.log('✅ Email status updated in database');
        setSuccessMessage('Email flagged successfully! Detection has been created and email status updated.');
      }

      // Refresh emails to update the UI
      await loadEmails(true);
      
    } catch (err: any) {
      console.error('❌ Failed to flag email:', err);
      setError(`Failed to flag email: ${err.message}`);
    } finally {
      setFlaggingEmail(null);
    }
  };

  const unflagEmail = async (email: Email) => {
    console.log('🚩 Unflagging email:', email.id);
    setUnflaggingEmail(email.id);
    setError(null);
    setSuccessMessage(null);
    setInfoMessage(null);

    try {
      // Check if email has a linked detection
      if (!email.detectionId) {
        setInfoMessage('This email does not have a linked detection to unflag.');
        return;
      }

      const response = await fetch(`/api/detections/${email.detectionId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || `Failed to unflag email: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Detection deleted successfully:', result);

      // Update email status in database
      const updatePayload = {
        flaggedCategory: 'clean',
        flaggedSeverity: undefined,
        investigationStatus: 'resolved',
        detectionId: undefined,
        flaggedBy: 'Security Analyst'
      };

      const emailUpdateResponse = await fetch(`/api/email/${email.messageId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      });

      if (!emailUpdateResponse.ok) {
        const errorData = await emailUpdateResponse.json();
        console.warn('⚠️ Failed to update email status in database:', errorData);
        // Don't throw error here - the detection was deleted successfully
        // The email might not exist in the database or might have a different messageId format
        setSuccessMessage('Email unflagged successfully. Note: Email status update in database failed, but detection was removed.');
      } else {
        console.log('✅ Email status updated in database');
        setSuccessMessage('Email unflagged successfully and marked as clean.');
      }

      // Refresh emails to update the UI
      await loadEmails(true);
      
    } catch (err: any) {
      console.error('❌ Failed to unflag email:', err);
      setError(`Failed to unflag email: ${err.message}`);
    } finally {
      setUnflaggingEmail(null);
    }
  };

  // Error state (keeping existing error handling)
  if (error) {
    return (
      <AppLayout
        username="John Doe"
        notificationsCount={2}
      >
        <FadeInSection>
          <Alert variant="destructive" className="mb-6 bg-red-900/20 border-red-500/20 text-white">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <AlertTitle className="text-white">Error Loading Emails</AlertTitle>
            <AlertDescription className="text-gray-300">
              {error}
            </AlertDescription>
          </Alert>
          
          {debugInfo && (
            <Card className="mb-6 bg-[#0f0f0f] border-none text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Database className="h-4 w-4 text-white" />
                  Debug Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div><strong className="text-white">Organization ID:</strong> <span className="text-gray-400">{debugInfo.orgId || 'Not set'}</span></div>
                  <div><strong className="text-white">Table Name:</strong> <span className="text-gray-400">{debugInfo.tableName}</span></div>
                  <div><strong className="text-white">Region:</strong> <span className="text-gray-400">{debugInfo.region || 'Not specified'}</span></div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-red-500/20 bg-[#0f0f0f]">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4">
                <AlertTriangle className="h-12 w-12 text-red-400" />
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-white">Failed to Load Emails</h3>
                  <p className="text-gray-400 mt-2">
                    There was an error connecting to the email database. This could be due to:
                  </p>
                  <ul className="text-sm text-gray-400 mt-2 text-left max-w-md">
                    <li>• WorkMail webhook not configured</li>
                    <li>• Database connection issues</li>
                    <li>• Missing environment variables</li>
                    <li>• AWS permissions issues</li>
                  </ul>
                </div>
                <Button onClick={refreshEmails} className="mt-4 bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        </FadeInSection>
      </AppLayout>
    );
  }

  // Main UI continues...
  return (
    <AppLayout
      username="John Doe"
      notificationsCount={2}
    >
      <FadeInSection>
        {/* Success Message */}
        {successMessage && (
          <Alert className="mb-6 bg-green-900/20 border-green-500/20 text-white">
            <CheckCircle className="h-4 w-4 text-green-400" />
            <AlertTitle className="text-white">Success</AlertTitle>
            <AlertDescription className="text-gray-300">
              {successMessage}
            </AlertDescription>
          </Alert>
        )}

        {/* Info Message */}
        {infoMessage && (
          <Alert className="mb-6 bg-blue-900/20 border-blue-500/20 text-white">
            <Info className="h-4 w-4 text-blue-400" />
            <AlertTitle className="text-white">Information</AlertTitle>
            <AlertDescription className="text-gray-300">
              {infoMessage}
            </AlertDescription>
          </Alert>
        )}

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2 text-white">
            <Mail className="text-white" /> All Emails
            {employeeFilter && (
              <Badge variant="outline" className="bg-white/20 text-white border-white/20">Filter: {employeeFilter}</Badge>
            )}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshEmails}
            disabled={loading}
            className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
          >
            <RefreshCw className={`mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Debug Info */}
        {debugInfo && (
          <Card className="mb-6 bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm text-white">
                <Database className="h-4 w-4 text-white" />
                Database Connection Status
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <div className="font-medium text-white">Organization</div>
                  <div className="text-gray-400">{debugInfo.orgId || 'Not set'}</div>
                </div>
                <div>
                  <div className="font-medium text-white">Table</div>
                  <div className="text-gray-400">{debugInfo.tableName}</div>
                </div>
                <div>
                  <div className="font-medium text-white">Items Found</div>
                  <div className="text-gray-400">{debugInfo.totalItems || 0}</div>
                </div>
                <div>
                  <div className="font-medium text-white">Connection</div>
                  <div className="flex items-center gap-1 text-green-400">
                    <Wifi className="h-3 w-3" />
                    Active
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats - UPDATED to include flagged categories */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
          <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Total</p>
                  <p className="text-2xl font-bold text-white">{emails.length}</p>
                </div>
                <Mail className="text-gray-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">AI Flagged</p>
                  <p className="text-2xl font-bold text-purple-400">
                    {emails.filter(e => e.flaggedCategory === "ai").length}
                  </p>
                </div>
                <Shield className="text-purple-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Manual</p>
                  <p className="text-2xl font-bold text-orange-400">
                    {emails.filter(e => e.flaggedCategory === "manual").length}
                  </p>
                </div>
                <Flag className="text-orange-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Clean</p>
                  <p className="text-2xl font-bold text-green-400">
                    {emails.filter(e => e.flaggedCategory === "clean").length}
                  </p>
                </div>
                <CheckCircle className="text-green-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">In Progress</p>
                  <p className="text-2xl font-bold text-yellow-400">
                    {emails.filter(e => e.investigationStatus === "in_progress").length}
                  </p>
                </div>
                <Activity className="text-yellow-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Resolved</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {emails.filter(e => e.investigationStatus === "resolved").length}
                  </p>
                </div>
                <CheckCircle className="text-blue-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters - UPDATED with new filter options */}
        <Card className="mb-6 bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Filter className="text-white" /> Filters & Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-white">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search emails..."
                    className="pl-10 bg-[#1f1f1f] border-[#1f1f1f] text-white placeholder:text-gray-400 focus:bg-[#2a2a2a] focus:border-[#2a2a2a]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-white">Direction</label>
                <Select value={directionFilter} onValueChange={setDirectionFilter}>
                  <SelectTrigger className="bg-[#1f1f1f] border-[#1f1f1f] text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]">
                    <SelectValue/>
                  </SelectTrigger>
                  <SelectContent className="bg-[#1f1f1f] border-[#1f1f1f]">
                    <SelectItem value="all" className="text-white focus:bg-[#2a2a2a] focus:text-white">All</SelectItem>
                    <SelectItem value="inbound" className="text-white focus:bg-[#2a2a2a] focus:text-white">Inbound</SelectItem>
                    <SelectItem value="outbound" className="text-white focus:bg-[#2a2a2a] focus:text-white">Outbound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-white">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-[#1f1f1f] border-[#1f1f1f] text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]">
                    <SelectValue/>
                  </SelectTrigger>
                  <SelectContent className="bg-[#1f1f1f] border-[#1f1f1f]">
                    <SelectItem value="all" className="text-white focus:bg-[#2a2a2a] focus:text-white">All</SelectItem>
                    <SelectItem value="received" className="text-white focus:bg-[#2a2a2a] focus:text-white">Received</SelectItem>
                    <SelectItem value="analyzed" className="text-white focus:bg-[#2a2a2a] focus:text-white">Analyzed</SelectItem>
                    <SelectItem value="quarantined" className="text-white focus:bg-[#2a2a2a] focus:text-white">Quarantined</SelectItem>
                    <SelectItem value="blocked" className="text-white focus:bg-[#2a2a2a] focus:text-white">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* NEW: Second row of filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-white">Flagged Category</label>
                <Select value={flaggedFilter} onValueChange={setFlaggedFilter}>
                  <SelectTrigger className="bg-[#1f1f1f] border-[#1f1f1f] text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]">
                    <SelectValue/>
                  </SelectTrigger>
                  <SelectContent className="bg-[#1f1f1f] border-[#1f1f1f]">
                    <SelectItem value="all" className="text-white focus:bg-[#2a2a2a] focus:text-white">All</SelectItem>
                    <SelectItem value="none" className="text-white focus:bg-[#2a2a2a] focus:text-white">None</SelectItem>
                    <SelectItem value="ai" className="text-white focus:bg-[#2a2a2a] focus:text-white">AI Flagged</SelectItem>
                    <SelectItem value="manual" className="text-white focus:bg-[#2a2a2a] focus:text-white">Manual Flagged</SelectItem>
                    <SelectItem value="clean" className="text-white focus:bg-[#2a2a2a] focus:text-white">Clean</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-white">Investigation Status</label>
                <Select value={investigationFilter} onValueChange={setInvestigationFilter}>
                  <SelectTrigger className="bg-[#1f1f1f] border-[#1f1f1f] text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]">
                    <SelectValue/>
                  </SelectTrigger>
                  <SelectContent className="bg-[#1f1f1f] border-[#1f1f1f]">
                    <SelectItem value="all" className="text-white focus:bg-[#2a2a2a] focus:text-white">All</SelectItem>
                    <SelectItem value="new" className="text-white focus:bg-[#2a2a2a] focus:text-white">New</SelectItem>
                    <SelectItem value="in_progress" className="text-white focus:bg-[#2a2a2a] focus:text-white">In Progress</SelectItem>
                    <SelectItem value="resolved" className="text-white focus:bg-[#2a2a2a] focus:text-white">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-white">Threat Level</label>
                <Select value={threatFilter} onValueChange={setThreatFilter}>
                  <SelectTrigger className="bg-[#1f1f1f] border-[#1f1f1f] text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]">
                    <SelectValue/>
                  </SelectTrigger>
                  <SelectContent className="bg-[#1f1f1f] border-[#1f1f1f]">
                    <SelectItem value="all" className="text-white focus:bg-[#2a2a2a] focus:text-white">All</SelectItem>
                    <SelectItem value="threats" className="text-white focus:bg-[#2a2a2a] focus:text-white">Any Threat</SelectItem>
                    <SelectItem value="critical" className="text-white focus:bg-[#2a2a2a] focus:text-white">Critical</SelectItem>
                    <SelectItem value="high" className="text-white focus:bg-[#2a2a2a] focus:text-white">High</SelectItem>
                    <SelectItem value="medium" className="text-white focus:bg-[#2a2a2a] focus:text-white">Medium</SelectItem>
                    <SelectItem value="low" className="text-white focus:bg-[#2a2a2a] focus:text-white">Low</SelectItem>
                    <SelectItem value="none" className="text-white focus:bg-[#2a2a2a] focus:text-white">Clean</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Email Table */}
        <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
          <CardHeader>
            <CardTitle className="text-white">Email List</CardTitle>
          </CardHeader>
          <CardContent>
            {(loading && emails.length === 0) ? (
              <div className="text-center py-8">
                <RefreshCw className="animate-spin mx-auto h-8 w-8 mb-4 text-white" />
                <p className="text-white">Loading emails...</p>
                <p className="text-sm text-gray-400 mt-2">
                  Connecting to database and fetching email data...
                </p>
              </div>
            ) : filteredEmails.length === 0 && emails.length === 0 ? (
              <div className="text-center py-12">
                <Mail className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium mb-2 text-white">No Emails Found</h3>
                <p className="text-gray-400 mb-6 max-w-md mx-auto">
                  No emails are currently available. This might be because:
                </p>
                <ul className="text-sm text-gray-400 mb-6 text-left max-w-md mx-auto space-y-1">
                  <li>• No monitored employees have received emails yet</li>
                  <li>• WorkMail webhook is not configured</li>
                  <li>• Emails are not being processed by the system</li>
                </ul>
                <div className="flex gap-2 justify-center">
                  <Button 
                    variant="outline" 
                    onClick={() => router.push('/admin/company-settings/user-management')}
                    className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Manage Employees
                  </Button>
                  <Button onClick={refreshEmails} className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                </div>
              </div>
            ) : filteredEmails.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Search className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p className="text-white">No emails match your current filters.</p>
                <p className="text-sm mt-2 text-gray-400">Try adjusting your search criteria.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
                        <TableHead className="text-white w-48">Subject</TableHead>
                        <TableHead className="text-white w-44">Sender</TableHead>
                        <TableHead className="text-white w-44">Recipients</TableHead>
                        <TableHead className="text-white w-36">Received</TableHead>
                        <TableHead className="text-white w-24">Direction</TableHead>
                        <TableHead className="text-white w-28">Flagged</TableHead>
                        <TableHead className="text-white w-28">Investigation</TableHead>
                        <TableHead className="text-white w-24">Status</TableHead>
                        <TableHead className="text-white w-28">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                  <TableBody>
                    {filteredEmails.map(email => (
                      <TableRow key={email.id} className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
                        <TableCell className="font-medium text-white">
                          <div className="w-48">
                            <div className="truncate text-sm" title={email.subject || 'No Subject'}>
                              {email.subject || 'No Subject'}
                            </div>
                            {email.urls?.length ? (
                              <div className="text-xs text-gray-400">
                                {email.urls.length} URL{email.urls.length > 1 ? "s" : ""}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-white">
                          <div className="w-44 truncate text-sm" title={email.sender}>
                            {email.sender}
                          </div>
                        </TableCell>
                        <TableCell className="text-white">
                          <div className="w-44 truncate text-sm" title={email.recipients.join(", ")}>
                            {email.recipients.slice(0, 2).join(", ")}
                            {email.recipients.length > 2 && ` +${email.recipients.length - 2}`}
                          </div>
                        </TableCell>
                        <TableCell className="text-white">
                          <div className="text-xs">
                            {new Date(email.timestamp).toLocaleDateString()}
                            <br />
                            {new Date(email.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={email.direction === "inbound" ? "secondary" : "outline"}
                            className={email.direction === "inbound" ? "bg-blue-900/30 text-blue-300 border-blue-600/30" : "bg-gray-800/50 text-gray-300 border-gray-600/50"}
                          >
                            {email.direction}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {getFlaggedBadge(email.flaggedCategory, email.flaggedSeverity)}
                        </TableCell>
                        <TableCell>
                          {getInvestigationBadge(email.investigationStatus)}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(email.status)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => viewEmail(email)}
                              title="View Email"
                              className="text-white hover:bg-[#2a2a2a] hover:text-white p-2"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {/* Show flag button for emails that aren't flagged or are marked as clean */}
                            {(email.flaggedCategory === 'none' || email.flaggedCategory === 'clean') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => flagEmail(email)}
                                disabled={flaggingEmail === email.id}
                                title="Flag as Suspicious"
                                className="text-orange-400 hover:bg-orange-900/30 hover:text-orange-300 p-2"
                              >
                                {flaggingEmail === email.id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Flag className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            {/* Show unflag button for flagged emails */}
                            {(email.flaggedCategory === 'manual' || email.flaggedCategory === 'ai') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => unflagEmail(email)}
                                disabled={unflaggingEmail === email.id}
                                title="Unflag Email"
                                className="text-green-400 hover:bg-green-900/30 hover:text-green-300 p-2"
                              >
                                {unflaggingEmail === email.id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Load more indicator */}
                {loadingMore && (
                  <div className="text-center py-4">
                    <RefreshCw className="animate-spin mx-auto h-5 w-5 mb-2 text-white" />
                    <p className="text-sm text-gray-400">Loading more emails...</p>
                  </div>
                )}
                {!hasMore && !loadingMore && emails.length > 0 && (
                  <div className="text-center py-4 text-gray-400">
                    <div className="text-sm">All emails loaded ({emails.length} total)</div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Email Viewer Dialog - IMPROVED */}
        {selectedEmail && (
          <div 
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setSelectedEmail(null);
              }
            }}
          >
            <div 
              className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="border-b border-[#1f1f1f] p-6 flex justify-between items-center">
                <h3 className="text-xl font-semibold text-white">Email Details</h3>
                <div className="flex items-center gap-3">
                  {(selectedEmail.flaggedCategory === 'none' || selectedEmail.flaggedCategory === 'clean') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => flagEmail(selectedEmail)}
                      disabled={flaggingEmail === selectedEmail.id}
                      className="bg-orange-900/20 border-orange-600/30 text-orange-300 hover:bg-orange-900/40"
                    >
                      {flaggingEmail === selectedEmail.id ? (
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Flag className="h-4 w-4 mr-2" />
                      )}
                      Flag as Suspicious
                    </Button>
                  )}
                  {(selectedEmail.flaggedCategory === 'manual' || selectedEmail.flaggedCategory === 'ai') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => unflagEmail(selectedEmail)}
                      disabled={unflaggingEmail === selectedEmail.id}
                      className="bg-green-900/20 border-green-600/30 text-green-300 hover:bg-green-900/40"
                    >
                      {unflaggingEmail === selectedEmail.id ? (
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      Mark as Clean
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedEmail(null)}
                    className="text-white hover:bg-[#2a2a2a]"
                  >
                    ✕
                  </Button>
                </div>
              </div>
              
              {/* Content - Scrollable */}
              <div className="flex-1 overflow-y-auto">
                <div className="p-6 space-y-6">
                  {/* Email Header Info */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="bg-[#1a1a1a] border-[#2a2a2a]">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-white text-base">Email Information</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <label className="text-sm font-medium text-gray-400">Subject</label>
                          <p className="font-medium text-white mt-1 break-words">{selectedEmail.subject || 'No Subject'}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-400">From</label>
                          <p className="font-mono text-sm text-white mt-1 break-all">{selectedEmail.sender}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-400">To</label>
                          <div className="mt-1">
                            {selectedEmail.recipients?.length > 0 ? (
                              <div className="space-y-1">
                                {selectedEmail.recipients.map((recipient, index) => (
                                  <p key={index} className="font-mono text-sm text-white break-all">{recipient}</p>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-400">No recipients</p>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-400">Received</label>
                          <p className="text-sm text-white mt-1">
                            {selectedEmail.timestamp ? 
                              (() => {
                                try {
                                  return new Date(selectedEmail.timestamp).toLocaleString();
                                } catch (error) {
                                  return selectedEmail.timestamp;
                                }
                              })() 
                              : 'Unknown'
                            }
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-[#1a1a1a] border-[#2a2a2a]">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-white text-base">Status & Security</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <label className="text-sm font-medium text-gray-400">Direction</label>
                          <div className="mt-1">
                            <Badge
                              variant={selectedEmail.direction === "inbound" ? "secondary" : "outline"}
                              className={selectedEmail.direction === "inbound" ? "bg-blue-900/30 text-blue-300 border-blue-600/30" : "bg-gray-800/50 text-gray-300 border-gray-600/50"}
                            >
                              {selectedEmail.direction}
                            </Badge>
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-400">Flagged Status</label>
                          <div className="mt-1">{getFlaggedBadge(selectedEmail.flaggedCategory, selectedEmail.flaggedSeverity)}</div>
                        </div>
                        {selectedEmail.investigationStatus && (
                          <div>
                            <label className="text-sm font-medium text-gray-400">Investigation</label>
                            <div className="mt-1">{getInvestigationBadge(selectedEmail.investigationStatus)}</div>
                          </div>
                        )}
                        <div>
                          <label className="text-sm font-medium text-gray-400">Status</label>
                          <div className="mt-1">{getStatusBadge(selectedEmail.status)}</div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-400">Size</label>
                          <p className="text-sm text-white mt-1">{selectedEmail.size ? (selectedEmail.size / 1024).toFixed(1) : '0.0'} KB</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-400">Message ID</label>
                          <p className="text-xs text-gray-400 mt-1 font-mono break-all">{selectedEmail.messageId}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Investigation Details */}
                  {selectedEmail.investigationNotes && (
                    <Card className="bg-[#1a1a1a] border-[#2a2a2a]">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-white text-base">Investigation Notes</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="bg-[#0f0f0f] p-4 rounded-lg">
                          <p className="text-sm text-white whitespace-pre-wrap">{selectedEmail.investigationNotes}</p>
                          {selectedEmail.flaggedAt && (
                            <div className="mt-3 pt-3 border-t border-[#2a2a2a]">
                              <p className="text-xs text-gray-400">
                                Flagged {selectedEmail.flaggedBy ? `by ${selectedEmail.flaggedBy}` : ''} on {new Date(selectedEmail.flaggedAt).toLocaleString()}
                              </p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Email Body */}
                  <Card className="bg-[#1a1a1a] border-[#2a2a2a]">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-white text-base">Message Content</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-[#0f0f0f] p-4 rounded-lg">
                        {/* Debug information */}
                        
                        {selectedEmail.bodyHtml ? (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                              <span>HTML Content:</span>
                              <Badge variant="outline" className="border-blue-500/30 text-blue-400">HTML</Badge>
                              <span className="text-xs">({selectedEmail.bodyHtml.length} chars)</span>
                            </div>
                            <div 
                              className="text-sm text-white prose prose-invert max-w-none"
                              dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
                            />
                            {selectedEmail.body && selectedEmail.body !== selectedEmail.bodyHtml && (
                              <>
                                <div className="border-t border-[#2a2a2a] my-4"></div>
                                <div className="text-sm text-gray-400 mb-2">Plain Text Version:</div>
                                <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">{selectedEmail.body}</pre>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                              <span>Plain Text Content:</span>
                              <Badge variant="outline" className="border-gray-500/30 text-gray-400">TEXT</Badge>
                              <span className="text-xs">({(selectedEmail.body?.length || 0)} chars)</span>
                            </div>
                            <pre className="text-sm text-white whitespace-pre-wrap font-mono leading-relaxed">
                              {selectedEmail.body || 'No message content'}
                            </pre>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Attachments & URLs */}
                  {(selectedEmail.attachments?.length > 0 || (selectedEmail.urls && selectedEmail.urls.length > 0)) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {selectedEmail.attachments?.length > 0 && (
                        <Card className="bg-[#1a1a1a] border-[#2a2a2a]">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-white text-base flex items-center gap-2">
                              <span>Attachments</span>
                              <Badge variant="outline" className="border-red-500/30 text-red-400">
                                {selectedEmail.attachments?.length}
                              </Badge>
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              {selectedEmail.attachments?.map((attachment, index) => (
                                <div key={index} className="p-3 bg-[#0f0f0f] rounded-lg border border-[#2a2a2a]">
                                  <p className="text-sm text-white font-mono break-all">{attachment}</p>
                                </div>
                              )) || (
                                <p className="text-sm text-gray-400">No attachments</p>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {(selectedEmail.urls?.length ?? 0) > 0 && (
                        <Card className="bg-[#1a1a1a] border-[#2a2a2a]">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-white text-base flex items-center gap-2">
                              <span>URLs Found</span>
                              <Badge variant="outline" className="border-yellow-500/30 text-yellow-400">
                                {selectedEmail.urls?.length ?? 0}
                              </Badge>
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              {(selectedEmail.urls ?? []).map((url, index) => (
                                <div key={index} className="p-3 bg-[#0f0f0f] rounded-lg border border-[#2a2a2a]">
                                  <p className="text-sm text-blue-400 font-mono break-all">{url}</p>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </FadeInSection>
    </AppLayout>
  );
}