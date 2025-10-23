// app/admin/all-emails/page.tsx - IMPROVED VERSION WITH BETTER EMAIL VIEWING
"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams, useParams } from "next/navigation"
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
  AlertCircle,
  Copy,
  FileText
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
  currentPage: number
  hasMore: boolean
  message?: string
  debug?: {
    orgId: string
    tableName: string
    totalItems?: number
    currentPage?: number
    hasMore?: boolean
  }
}

export default function AdminAllEmailsPage() {
  const router = useRouter()
  const params = useParams()
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
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const ITEMS_PER_PAGE = 20

  // Email viewing & flagging
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [flaggingEmail, setFlaggingEmail] = useState<string | null>(null)
  const [unflaggingEmail, setUnflaggingEmail] = useState<string | null>(null)
  
  // Success/info messages
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true)

  // Email viewer state
  const [emailViewerTab, setEmailViewerTab] = useState<"content" | "html" | "headers" | "debug">("content")

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

  // Fetch emails for specific page
  const loadEmails = useCallback(
    async (page: number = 1, searchTerm?: string) => {
      // Use provided search term or current search query
      const currentSearchQuery = searchTerm !== undefined ? searchTerm : searchQuery;
      
      setLoading(true);
      setError(null);

      console.log(`📧 Loading emails for page ${page}${currentSearchQuery ? ` with search: "${currentSearchQuery}"` : ''}`);

      try {
        // Load emails with page-based pagination
        const params = new URLSearchParams({ 
          limit: '20', // Standard page size
          page: page.toString()
        });
        if (currentSearchQuery.trim()) {
          params.set('search', currentSearchQuery.trim());
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
        setHasMore(data.hasMore || false);

        if (data.emails && data.emails.length > 0) {
          // Process recipients to handle different formats
          const processedEmails = data.emails.map(email => ({
            ...email,
            recipients: Array.isArray(email.recipients) ? email.recipients :
                       typeof email.recipients === 'string' ? [email.recipients] :
                       email.recipients ? Object.values(email.recipients).filter(r => typeof r === 'string') : []
          }));
          
          console.log('📋 Sample emails received:', processedEmails.slice(0, 3).map(e => ({
            id: e.id,
            subject: e.subject,
            sender: e.sender,
            recipients: e.recipients,
            timestamp: e.timestamp,
            flaggedCategory: e.flaggedCategory,
            flaggedSeverity: e.flaggedSeverity,
            investigationStatus: e.investigationStatus,
            bodyExists: !!e.body,
            bodyLength: e.body?.length || 0,
            bodyHtmlExists: !!e.bodyHtml,
            bodyHtmlLength: e.bodyHtml?.length || 0,
            firstBodyChars: e.body ? e.body.substring(0, 100) + '...' : 'NO BODY',
            hasValidContent: e.body && e.body.trim().length > 0
          })));
          
          // Check all emails for body content
          const emailsWithBody = processedEmails.filter(e => e.body && e.body.trim().length > 0);
          const emailsWithHtml = processedEmails.filter(e => e.bodyHtml && e.bodyHtml.trim().length > 0);
          const emailsWithoutContent = processedEmails.filter(e => !e.body || e.body.trim().length === 0);
          
          console.log('📊 Body content analysis:', {
            totalEmails: processedEmails.length,
            emailsWithBody: emailsWithBody.length,
            emailsWithHtml: emailsWithHtml.length,
            emailsWithoutBody: emailsWithoutContent.length,
            contentCoverage: `${Math.round((emailsWithBody.length / processedEmails.length) * 100)}%`
          });
          
          // Log examples of emails without content for debugging
          if (emailsWithoutContent.length > 0) {
            console.warn('📧 Emails without body content (first 3):');
            emailsWithoutContent.slice(0, 3).forEach((email, i) => {
              console.warn(`  ${i + 1}. ${email.subject} (${email.messageId}) - body: "${email.body}"`);
            });
          }

          // Always replace emails for page-based navigation
          setEmails(processedEmails);
          setCurrentPage(data.currentPage);

          console.log('✅ Emails loaded successfully:', {
            emailsOnPage: processedEmails.length,
            currentPage: data.currentPage,
            hasMore: data.hasMore
          });
        } else {
          console.log('ℹ️ No emails in response');
          setEmails([]);
          setCurrentPage(page);
        }

      } catch (e: any) {
        console.error("❌ loadEmails error details:", {
          message: e.message,
          stack: e.stack?.split('\n').slice(0, 3)
        });
        setError(e.message || "Failed to load emails");
      } finally {
        setLoading(false);
      }
    },
    [searchQuery]
  );

  // Initial load
  useEffect(() => {
    console.log('🚀 All Emails page mounted, loading initial data...');
    loadEmails(1, ''); // Initial load with empty search
  }, []); // Only run once on mount

  // Auto-refresh every 30 seconds to show new emails automatically
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    console.log('⏰ Setting up auto-refresh every 30 seconds');
    const intervalId = setInterval(() => {
      if (!loading) {
        console.log('🔄 Auto-refreshing emails...');
        loadEmails(1, searchQuery); // Preserve search during auto-refresh
      }
    }, 30000); // 30 seconds

    return () => {
      console.log('⏰ Cleaning up auto-refresh interval');
      clearInterval(intervalId);
    };
  }, [loadEmails, autoRefreshEnabled, loading]);


  // Handle search changes - trigger new API call when search query changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // When search query changes, reload emails with search and reset to page 1
      console.log('🔍 Search query changed, reloading emails...', searchQuery);
      setCurrentPage(1);
      loadEmails(1, searchQuery);
    }, 500); // Debounce search for 500ms

    return () => clearTimeout(timeoutId);
  }, [searchQuery, loadEmails]);

  // Apply filters (excluding search since it's handled server-side now)
  useEffect(() => {
    console.log('🔍 Applying client-side filters...', {
      employeeFilter,
      directionFilter,
      threatFilter,
      statusFilter,
      flaggedFilter,
      investigationFilter,
      totalEmails: emails.length
    });

    let list = [...emails];

    // Note: Text search is now handled server-side, so we skip it here

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
    employeeFilter,
    directionFilter,
    threatFilter,
    statusFilter,
    flaggedFilter,
    investigationFilter,
    currentPage
  ]);

  // Badge renderers
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
    loadEmails(currentPage, searchQuery); // Preserve current page and search when refreshing
  };

  // Page navigation
  const goToPage = (page: number) => {
    if (page >= 1) {
      console.log(`📄 Navigating to page ${page}`);
      loadEmails(page, searchQuery);
    }
  };

  // Generate page numbers for display
  const getPageNumbers = () => {
    const pages = [];
    const totalToShow = 7; // Show up to 7 page numbers
    const halfRange = Math.floor(totalToShow / 2);
    
    // We don't know total pages, so show current page ± range
    let start = Math.max(1, currentPage - halfRange);
    let end = currentPage + halfRange;
    
    // Add extra pages at the beginning if we're near the start
    if (currentPage <= halfRange) {
      end = totalToShow;
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    return pages;
  };

  const viewEmail = (email: Email) => {
    console.log('👁️ Viewing email:', email.id);
    console.log('📧 Full email object:', email);
    console.log('📧 Email body content validation:', {
      bodyExists: !!email.body,
      bodyLength: email.body?.length || 0,
      bodyContent: email.body,
      bodyHtmlExists: !!email.bodyHtml,
      bodyHtmlLength: email.bodyHtml?.length || 0,
      bodyHtmlContent: email.bodyHtml,
      messageId: email.messageId,
      subject: email.subject,
      hasValidBody: email.body && email.body.trim().length > 0,
      bodyPreview: email.body ? email.body.substring(0, 200) + '...' : 'NO BODY'
    });
    setSelectedEmail(email);
    setEmailViewerTab("content"); // Reset to content tab
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
        setSuccessMessage('Email flagged successfully! Detection has been created. Note: Email status update in database failed.');
      } else {
        console.log('✅ Email status updated in database');
        setSuccessMessage('Email flagged successfully! Detection has been created and email status updated.');
      }

      // Refresh emails to update the UI
      await loadEmails();
      
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
        setSuccessMessage('Email unflagged successfully. Note: Email status update in database failed, but detection was removed.');
      } else {
        console.log('✅ Email status updated in database');
        setSuccessMessage('Email unflagged successfully and marked as clean.');
      }

      await loadEmails();
      
    } catch (err: any) {
      console.error('❌ Failed to unflag email:', err);
      setError(`Failed to unflag email: ${err.message}`);
    } finally {
      setUnflaggingEmail(null);
    }
  };

  // Copy to clipboard helper
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setInfoMessage('Copied to clipboard!');
  };

  // Error state (keeping existing error handling)
  if (error) {
    return (
      <AppLayout
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
                <Button onClick={refreshEmails} className="mt-4 bg-[#1f1f1f] border-white/10 text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]">
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
      notificationsCount={2}
    >
      <FadeInSection>
        {/* Success Message */}
          {successMessage && (
            <Alert className="mb-6 border-green-500/30 bg-green-500/10 text-white">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <AlertTitle className="text-white">Success</AlertTitle>
              <AlertDescription className="text-gray-300">
                {successMessage}
              </AlertDescription>
            </Alert>
          )}

          {/* Info Message */}
          {infoMessage && (
            <Alert className="mb-6 border-blue-500/30 bg-blue-500/10 text-white">
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
        </div>


        {/* Filters */}
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
                    className="pl-10 bg-[#1f1f1f] border-white/10 text-white placeholder:text-gray-400 focus:bg-[#2a2a2a] focus:border-[#2a2a2a]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-white">Direction</label>
                <Select value={directionFilter} onValueChange={setDirectionFilter}>
                  <SelectTrigger className="bg-[#1f1f1f] border-white/10 text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]">
                    <SelectValue/>
                  </SelectTrigger>
                  <SelectContent className="bg-[#1f1f1f] border-white/10">
                    <SelectItem value="all" className="text-white focus:bg-[#2a2a2a] focus:text-white">All</SelectItem>
                    <SelectItem value="inbound" className="text-white focus:bg-[#2a2a2a] focus:text-white">Inbound</SelectItem>
                    <SelectItem value="outbound" className="text-white focus:bg-[#2a2a2a] focus:text-white">Outbound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-white">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-[#1f1f1f] border-white/10 text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]">
                    <SelectValue/>
                  </SelectTrigger>
                  <SelectContent className="bg-[#1f1f1f] border-white/10">
                    <SelectItem value="all" className="text-white focus:bg-[#2a2a2a] focus:text-white">All</SelectItem>
                    <SelectItem value="received" className="text-white focus:bg-[#2a2a2a] focus:text-white">Received</SelectItem>
                    <SelectItem value="analyzed" className="text-white focus:bg-[#2a2a2a] focus:text-white">Analyzed</SelectItem>
                    <SelectItem value="quarantined" className="text-white focus:bg-[#2a2a2a] focus:text-white">Quarantined</SelectItem>
                    <SelectItem value="blocked" className="text-white focus:bg-[#2a2a2a] focus:text-white">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-white">Flagged Category</label>
                <Select value={flaggedFilter} onValueChange={setFlaggedFilter}>
                  <SelectTrigger className="bg-[#1f1f1f] border-white/10 text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]">
                    <SelectValue/>
                  </SelectTrigger>
                  <SelectContent className="bg-[#1f1f1f] border-white/10">
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
                  <SelectTrigger className="bg-[#1f1f1f] border-white/10 text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]">
                    <SelectValue/>
                  </SelectTrigger>
                  <SelectContent className="bg-[#1f1f1f] border-white/10">
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
                  <SelectTrigger className="bg-[#1f1f1f] border-white/10 text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]">
                    <SelectValue/>
                  </SelectTrigger>
                  <SelectContent className="bg-[#1f1f1f] border-white/10">
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
            <div className="flex justify-between items-center">
              <CardTitle className="text-white">Email List</CardTitle>
              <div className="text-sm text-gray-400">
                Page {currentPage} ({filteredEmails.length} emails)
                {hasMore && <span className="text-blue-400"> • More available</span>}
              </div>
            </div>
            
            {/* Pagination Controls */}
            <div className="flex justify-center items-center gap-2 pt-4">
              {/* First Page */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goToPage(1)}
                disabled={currentPage === 1}
                className="text-white hover:bg-[#2a2a2a] disabled:opacity-50"
              >
                ««
              </Button>
              
              {/* Previous Page */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="text-white hover:bg-[#2a2a2a] disabled:opacity-50"
              >
                ‹ Previous
              </Button>
              
              {/* Page Numbers */}
              {getPageNumbers().map(pageNum => (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "default" : "ghost"}
                  size="sm"
                  onClick={() => goToPage(pageNum)}
                  className={
                    currentPage === pageNum 
                      ? "bg-blue-600 text-white hover:bg-blue-700" 
                      : "text-white hover:bg-[#2a2a2a]"
                  }
                >
                  {pageNum}
                </Button>
              ))}
              
              {/* Next Page */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={!hasMore}
                className="text-white hover:bg-[#2a2a2a] disabled:opacity-50"
              >
                Next ›
              </Button>
            </div>
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
                    onClick={() => router.push(`/o/${params.orgId}/admin/company-settings/user-management`)}
                    className="bg-[#1f1f1f] border-white/10 text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Manage Employees
                  </Button>
                  <Button onClick={refreshEmails} className="bg-[#1f1f1f] border-white/10 text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]">
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
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-[#1f1f1f] border-white/10">
                        <TableHead className="text-white w-[220px]">Subject</TableHead>
                        <TableHead className="text-white w-[180px]">Sender</TableHead>
                        <TableHead className="text-white w-[120px]">Received</TableHead>
                        <TableHead className="text-white w-[110px]">Flagged</TableHead>
                        <TableHead className="text-white w-[110px]">Investigation</TableHead>
                        <TableHead className="text-white w-[120px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                  <TableBody>
                    {filteredEmails.map(email => (
                      <TableRow key={email.id} className="hover:bg-[#1f1f1f] border-white/10">
                        <TableCell className="font-medium text-white max-w-[220px]">
                          <div className="truncate text-sm" title={email.subject || 'No Subject'}>
                            {email.subject || 'No Subject'}
                          </div>
                        </TableCell>
                        <TableCell className="text-white max-w-[180px]">
                          <div className="truncate text-xs" title={email.sender}>
                            {email.sender}
                          </div>
                        </TableCell>
                        <TableCell className="text-white">
                          <div className="text-xs">
                            {new Date(email.timestamp).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getFlaggedBadge(email.flaggedCategory, email.flaggedSeverity)}
                        </TableCell>
                        <TableCell>
                          {getInvestigationBadge(email.investigationStatus)}
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

                {/* Pagination info at bottom */}
                {filteredEmails.length > 0 && (
                  <div className="text-center py-4 text-gray-400 border-t border-white/10 mt-4">
                    <div className="text-sm">
                      Showing {filteredEmails.length} emails on page {currentPage}
                      {hasMore && <span className="text-blue-400"> • More pages available</span>}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* IMPROVED Email Viewer Dialog */}
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
              className="bg-[#0f0f0f] border border-white/10 rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="border-b border-white/10 p-6 flex justify-between items-center">
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
              
              {/* Tabs */}
              <div className="border-b border-white/10 px-6">
                <div className="flex space-x-6">
                  <button
                    className={`py-2 px-1 border-b-2 text-sm font-medium ${
                      emailViewerTab === "content" 
                        ? "border-blue-500 text-blue-400" 
                        : "border-transparent text-gray-400 hover:text-white"
                    }`}
                    onClick={() => setEmailViewerTab("content")}
                  >
                    <FileText className="h-4 w-4 inline mr-2" />
                    Content
                  </button>
                  {selectedEmail.bodyHtml && (
                    <button
                      className={`py-2 px-1 border-b-2 text-sm font-medium ${
                        emailViewerTab === "html" 
                          ? "border-blue-500 text-blue-400" 
                          : "border-transparent text-gray-400 hover:text-white"
                      }`}
                      onClick={() => setEmailViewerTab("html")}
                    >
                      HTML
                    </button>
                  )}
                  <button
                    className={`py-2 px-1 border-b-2 text-sm font-medium ${
                      emailViewerTab === "headers" 
                        ? "border-blue-500 text-blue-400" 
                        : "border-transparent text-gray-400 hover:text-white"
                    }`}
                    onClick={() => setEmailViewerTab("headers")}
                  >
                    Headers
                  </button>
                  <button
                    className={`py-2 px-1 border-b-2 text-sm font-medium ${
                      emailViewerTab === "debug" 
                        ? "border-blue-500 text-blue-400" 
                        : "border-transparent text-gray-400 hover:text-white"
                    }`}
                    onClick={() => setEmailViewerTab("debug")}
                  >
                    Debug
                  </button>
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
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-400 font-mono break-all flex-1">{selectedEmail.messageId}</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(selectedEmail.messageId)}
                              className="text-gray-400 hover:text-white p-1"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Tab Content */}
                  {emailViewerTab === "content" && (
                    <Card className="bg-[#1a1a1a] border-[#2a2a2a]">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-white text-base flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Message Content
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="rounded-lg border border-app-border bg-app-surface p-4">
                          {selectedEmail.body && selectedEmail.body.trim().length > 0 ? (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 text-sm text-gray-400">
                                <span>Plain Text Content:</span>
                                <Badge variant="outline" className="border-gray-500/30 text-gray-400">TEXT</Badge>
                                <span className="text-xs">({selectedEmail.body.length} chars)</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(selectedEmail.body)}
                                  className="text-gray-400 hover:text-white p-1 ml-auto"
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                              <pre className="text-sm text-white whitespace-pre-wrap font-mono leading-relaxed">
                                {selectedEmail.body}
                              </pre>
                            </div>
                          ) : (
                            <div className="text-center py-8">
                              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                              <p className="text-white font-medium">No Message Content Available</p>
                              <p className="text-sm text-gray-400 mt-2">
                                The email body content could not be extracted or is empty.
                              </p>
                              <p className="text-xs text-gray-500 mt-2">
                                This could be due to complex email formatting, encryption, or processing limitations.
                              </p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {emailViewerTab === "html" && selectedEmail.bodyHtml && (
                    <Card className="card">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-white text-base">HTML Content</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="rounded-lg border border-app-border bg-app-surface p-4">
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                              <span>HTML Content:</span>
                              <Badge variant="outline" className="border-blue-500/30 text-blue-400">HTML</Badge>
                              <span className="text-xs">({selectedEmail.bodyHtml.length} chars)</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(selectedEmail.bodyHtml || '')}
                                className="text-gray-400 hover:text-white p-1 ml-auto"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <div 
                              className="text-sm text-white prose prose-invert max-w-none"
                              dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {emailViewerTab === "headers" && (
                    <Card className="card">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-white text-base">Email Headers</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="rounded-lg border border-app-border bg-app-surface p-4">
                          {Object.keys(selectedEmail.headers).length > 0 ? (
                            <div className="space-y-2">
                              {Object.entries(selectedEmail.headers).map(([key, value]) => (
                                <div key={key} className="border-b border-app-border/70 pb-2">
                                  <div className="font-mono text-sm">
                                    <span className="text-blue-400">{key}:</span>{' '}
                                    <span className="text-white break-all">{value}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-400 text-sm">No headers available</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {emailViewerTab === "debug" && (
                    <Card className="card">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-white text-base">Debug Information</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="rounded-lg border border-app-border bg-app-surface p-4">
                          <div className="space-y-4">
                            <div>
                              <h4 className="text-sm font-medium text-white mb-2">Content Analysis</h4>
                              <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                  <span className="text-gray-400">Body Length:</span>
                                  <span className="text-white ml-2">{selectedEmail.body?.length || 0} chars</span>
                                </div>
                                <div>
                                  <span className="text-gray-400">HTML Length:</span>
                                  <span className="text-white ml-2">{selectedEmail.bodyHtml?.length || 0} chars</span>
                                </div>
                                <div>
                                  <span className="text-gray-400">Has Body:</span>
                                  <span className={`ml-2 ${selectedEmail.body && selectedEmail.body.trim().length > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {selectedEmail.body && selectedEmail.body.trim().length > 0 ? 'Yes' : 'No'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-400">Has HTML:</span>
                                  <span className={`ml-2 ${selectedEmail.bodyHtml && selectedEmail.bodyHtml.trim().length > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {selectedEmail.bodyHtml && selectedEmail.bodyHtml.trim().length > 0 ? 'Yes' : 'No'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            <div>
                              <h4 className="text-sm font-medium text-white mb-2">Raw Email Object</h4>
                              <pre className="max-h-96 overflow-y-auto rounded border border-app-border bg-app p-3 font-mono text-xs text-gray-300">
                                {JSON.stringify(selectedEmail, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Attachments & URLs */}
                  {(selectedEmail.attachments?.length > 0 || (selectedEmail.urls && selectedEmail.urls.length > 0)) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {selectedEmail.attachments?.length > 0 && (
                        <Card className="card">
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
                                <div key={index} className="rounded-lg border border-app-border bg-app-surface p-3">
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
                        <Card className="card">
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
                                <div key={index} className="rounded-lg border border-app-border bg-app-surface p-3">
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
