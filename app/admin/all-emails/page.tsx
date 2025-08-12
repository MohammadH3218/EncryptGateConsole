// app/admin/all-emails/page.tsx
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
  Flag
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

  // Handle keyboard shortcuts for email viewer
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedEmail) {
        setSelectedEmail(null);
      }
    };

    if (selectedEmail) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent background scrolling
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [selectedEmail]);

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

        // Store debug info for display
        setDebugInfo(data.debug);

        // Log detailed email info
        if (data.emails && data.emails.length > 0) {
          console.log('📋 Sample emails received:', data.emails.slice(0, 3).map(e => ({
            id: e.id,
            subject: e.subject,
            sender: e.sender,
            timestamp: e.timestamp
          })));
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

  // Apply filters
  useEffect(() => {
    console.log('🔍 Applying filters...', {
      searchQuery,
      employeeFilter,
      directionFilter,
      threatFilter,
      statusFilter,
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
    statusFilter
  ]);

  // Badge renderers
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
    setSelectedEmail(email);
  };

  const flagEmail = async (email: Email) => {
    console.log('🚩 Flagging email as suspicious:', email.id);
    setFlaggingEmail(email.id);

    try {
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
      console.log('✅ Email flagged successfully:', result);

      // Refresh emails to update the UI
      await loadEmails(true);

      // Navigate to the new detection
      router.push(`/admin/investigate/${result.detectionId || result.id}`);
    } catch (err: any) {
      console.error('❌ Failed to flag email:', err);
      setError(`Failed to flag email: ${err.message}`);
    } finally {
      setFlaggingEmail(null);
    }
  };

  // Error state
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

  // Main UI
  return (
    <AppLayout
      username="John Doe"
      notificationsCount={2}
    >
      <FadeInSection>
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

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
                  <p className="text-sm text-gray-400">Threats</p>
                  <p className="text-2xl font-bold text-red-400">
                    {emails.filter(e => e.threatLevel !== "none").length}
                  </p>
                </div>
                <AlertTriangle className="text-red-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Phishing</p>
                  <p className="text-2xl font-bold text-orange-400">
                    {emails.filter(e => e.isPhishing).length}
                  </p>
                </div>
                <Shield className="text-orange-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Clean</p>
                  <p className="text-2xl font-bold text-green-400">
                    {emails.filter(e => e.threatLevel === "none").length}
                  </p>
                </div>
                <Activity className="text-green-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6 bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Filter className="text-white" /> Filters & Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                <Select
                  value={directionFilter}
                  onValueChange={setDirectionFilter}
                >
                  <SelectTrigger className="bg-[#1f1f1f] border-[#1f1f1f] text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]"><SelectValue/></SelectTrigger>
                  <SelectContent className="bg-[#1f1f1f] border-[#1f1f1f]">
                    <SelectItem value="all" className="text-white focus:bg-[#2a2a2a] focus:text-white">All</SelectItem>
                    <SelectItem value="inbound" className="text-white focus:bg-[#2a2a2a] focus:text-white">Inbound</SelectItem>
                    <SelectItem value="outbound" className="text-white focus:bg-[#2a2a2a] focus:text-white">Outbound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-white">Threat Level</label>
                <Select
                  value={threatFilter}
                  onValueChange={setThreatFilter}
                >
                  <SelectTrigger className="bg-[#1f1f1f] border-[#1f1f1f] text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]"><SelectValue/></SelectTrigger>
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
              <div>
                <label className="block text-sm font-medium mb-2 text-white">Status</label>
                <Select
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                >
                  <SelectTrigger className="bg-[#1f1f1f] border-[#1f1f1f] text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]"><SelectValue/></SelectTrigger>
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
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
                      <TableHead className="text-white">Subject</TableHead>
                      <TableHead className="text-white">Sender</TableHead>
                      <TableHead className="text-white">Recipients</TableHead>
                      <TableHead className="text-white">Received</TableHead>
                      <TableHead className="text-white">Direction</TableHead>
                      <TableHead className="text-white">Threat</TableHead>
                      <TableHead className="text-white">Status</TableHead>
                      <TableHead className="text-white">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmails.map(email => (
                      <TableRow key={email.id} className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
                        <TableCell className="font-medium text-white">
                          <div className="max-w-xs">
                            <div className="truncate">{email.subject || 'No Subject'}</div>
                            {email.urls?.length ? (
                              <div className="text-xs text-gray-400">
                                {email.urls.length} URL{email.urls.length > 1 ? "s" : ""}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-white">
                          <div className="max-w-xs truncate">{email.sender}</div>
                        </TableCell>
                        <TableCell className="text-white">
                          <div className="max-w-sm truncate">
                            {email.recipients.slice(0, 2).join(", ")}
                            {email.recipients.length > 2 && ` +${email.recipients.length - 2}`}
                          </div>
                        </TableCell>
                        <TableCell className="text-white">
                          <div className="text-sm">
                            {new Date(email.timestamp).toLocaleString()}
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
                          {getThreatBadge(email.threatLevel, email.isPhishing)}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(email.status)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => viewEmail(email)}
                              title="View Email"
                              className="text-white hover:bg-[#2a2a2a] hover:text-white"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {email.threatLevel === 'none' && !email.isPhishing && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => flagEmail(email)}
                                disabled={flaggingEmail === email.id}
                                title="Flag as Suspicious"
                                className="text-orange-400 hover:bg-[#2a2a2a] hover:text-orange-300"
                              >
                                {flaggingEmail === email.id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Flag className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

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

        {/* Email Viewer Dialog */}
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
              className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-[#0f0f0f] border-b border-[#1f1f1f] p-4 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-white">Email Details</h3>
                <div className="flex items-center gap-2">
                  {selectedEmail.threatLevel === 'none' && !selectedEmail.isPhishing && (
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
              
              <div className="p-4 space-y-4">
                {/* Email Header Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="bg-[#1a1a1a] border-[#2a2a2a]">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-medium text-gray-400">Subject</label>
                          <p className="font-medium text-white">{selectedEmail.subject || 'No Subject'}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-400">From</label>
                          <p className="font-mono text-sm text-white">{selectedEmail.sender}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-400">To</label>
                          <p className="font-mono text-sm text-white">{selectedEmail.recipients?.join(', ') || 'No recipients'}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-400">Received</label>
                          <p className="text-sm text-white">
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
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-[#1a1a1a] border-[#2a2a2a]">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-medium text-gray-400">Direction</label>
                          <Badge
                            variant={selectedEmail.direction === "inbound" ? "secondary" : "outline"}
                            className={selectedEmail.direction === "inbound" ? "bg-blue-900/30 text-blue-300 border-blue-600/30" : "bg-gray-800/50 text-gray-300 border-gray-600/50"}
                          >
                            {selectedEmail.direction}
                          </Badge>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-400">Threat Level</label>
                          <div>{getThreatBadge(selectedEmail.threatLevel, selectedEmail.isPhishing)}</div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-400">Status</label>
                          <div>{getStatusBadge(selectedEmail.status)}</div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-400">Size</label>
                          <p className="text-sm text-white">{selectedEmail.size ? (selectedEmail.size / 1024).toFixed(1) : '0.0'} KB</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Email Body */}
                <Card className="bg-[#1a1a1a] border-[#2a2a2a]">
                  <CardHeader>
                    <CardTitle className="text-white">Message Content</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-[#0f0f0f] p-4 rounded-lg max-h-96 overflow-y-auto">
                      <pre className="text-sm text-white whitespace-pre-wrap font-mono">{selectedEmail.body}</pre>
                    </div>
                  </CardContent>
                </Card>

                {/* Attachments & URLs */}
                {(selectedEmail.attachments?.length > 0 || (selectedEmail.urls && selectedEmail.urls.length > 0)) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedEmail.attachments?.length > 0 && (
                      <Card className="bg-[#1a1a1a] border-[#2a2a2a]">
                        <CardHeader>
                          <CardTitle className="text-white text-sm">Attachments ({selectedEmail.attachments?.length || 0})</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {selectedEmail.attachments?.map((attachment, index) => (
                              <div key={index} className="p-2 bg-[#0f0f0f] rounded">
                                <p className="text-sm text-white font-mono">{attachment}</p>
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
                        <CardHeader>
                          <CardTitle className="text-white text-sm">URLs Found ({selectedEmail.urls?.length ?? 0})</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {(selectedEmail.urls ?? []).map((url, index) => (
                              <div key={index} className="p-2 bg-[#0f0f0f] rounded">
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
        )}
      </FadeInSection>
    </AppLayout>
  );
}