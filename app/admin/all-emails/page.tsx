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
  Info,
  Database,
  Wifi,
  Users
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

  const viewEmail = (id: string) => {
    console.log('👁️ Viewing email:', id);
    router.push(`/admin/investigate/${id}`);
  };

  // Error state
  if (error) {
    return (
      <AppLayout
        username="John Doe"
        onSearch={setSearchQuery}
        notificationsCount={2}
      >
        <FadeInSection>
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error Loading Emails</AlertTitle>
            <AlertDescription>
              {error}
            </AlertDescription>
          </Alert>
          
          {debugInfo && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Debug Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div><strong>Organization ID:</strong> {debugInfo.orgId || 'Not set'}</div>
                  <div><strong>Table Name:</strong> {debugInfo.tableName}</div>
                  <div><strong>Region:</strong> {debugInfo.region || 'Not specified'}</div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4">
                <AlertTriangle className="h-12 w-12 text-destructive" />
                <div className="text-center">
                  <h3 className="text-lg font-semibold">Failed to Load Emails</h3>
                  <p className="text-muted-foreground mt-2">
                    There was an error connecting to the email database. This could be due to:
                  </p>
                  <ul className="text-sm text-muted-foreground mt-2 text-left max-w-md">
                    <li>• WorkMail webhook not configured</li>
                    <li>• Database connection issues</li>
                    <li>• Missing environment variables</li>
                    <li>• AWS permissions issues</li>
                  </ul>
                </div>
                <Button onClick={refreshEmails} className="mt-4">
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
      onSearch={setSearchQuery}
      notificationsCount={2}
    >
      <FadeInSection>
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Mail /> All Emails
            {employeeFilter && (
              <Badge variant="outline">Filter: {employeeFilter}</Badge>
            )}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshEmails}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Debug Info */}
        {debugInfo && (
          <Card className="mb-6 bg-muted/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Database className="h-4 w-4" />
                Database Connection Status
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <div className="font-medium">Organization</div>
                  <div className="text-muted-foreground">{debugInfo.orgId || 'Not set'}</div>
                </div>
                <div>
                  <div className="font-medium">Table</div>
                  <div className="text-muted-foreground">{debugInfo.tableName}</div>
                </div>
                <div>
                  <div className="font-medium">Items Found</div>
                  <div className="text-muted-foreground">{debugInfo.totalItems || 0}</div>
                </div>
                <div>
                  <div className="font-medium">Connection</div>
                  <div className="flex items-center gap-1 text-green-600">
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
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{emails.length}</p>
                </div>
                <Mail className="text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Threats</p>
                  <p className="text-2xl font-bold text-red-600">
                    {emails.filter(e => e.threatLevel !== "none").length}
                  </p>
                </div>
                <AlertTriangle className="text-red-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Phishing</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {emails.filter(e => e.isPhishing).length}
                  </p>
                </div>
                <Shield className="text-orange-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Clean</p>
                  <p className="text-2xl font-bold text-green-600">
                    {emails.filter(e => e.threatLevel === "none").length}
                  </p>
                </div>
                <Activity className="text-green-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter /> Filters & Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search emails..."
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Direction</label>
                <Select
                  value={directionFilter}
                  onValueChange={setDirectionFilter}
                >
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="inbound">Inbound</SelectItem>
                    <SelectItem value="outbound">Outbound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Threat Level</label>
                <Select
                  value={threatFilter}
                  onValueChange={setThreatFilter}
                >
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="threats">Any Threat</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="none">Clean</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <Select
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                >
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="received">Received</SelectItem>
                    <SelectItem value="analyzed">Analyzed</SelectItem>
                    <SelectItem value="quarantined">Quarantined</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Email Table */}
        <Card>
          <CardHeader>
            <CardTitle>Email List</CardTitle>
          </CardHeader>
          <CardContent>
            {(loading && emails.length === 0) ? (
              <div className="text-center py-8">
                <RefreshCw className="animate-spin mx-auto h-8 w-8 mb-4" />
                <p>Loading emails...</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Connecting to database and fetching email data...
                </p>
              </div>
            ) : filteredEmails.length === 0 && emails.length === 0 ? (
              <div className="text-center py-12">
                <Mail className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No Emails Found</h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  No emails are currently available. This might be because:
                </p>
                <ul className="text-sm text-muted-foreground mb-6 text-left max-w-md mx-auto space-y-1">
                  <li>• No monitored employees have received emails yet</li>
                  <li>• WorkMail webhook is not configured</li>
                  <li>• Emails are not being processed by the system</li>
                </ul>
                <div className="flex gap-2 justify-center">
                  <Button 
                    variant="outline" 
                    onClick={() => router.push('/admin/company-settings/user-management')}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Manage Employees
                  </Button>
                  <Button onClick={refreshEmails}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                </div>
              </div>
            ) : filteredEmails.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4" />
                <p>No emails match your current filters.</p>
                <p className="text-sm mt-2">Try adjusting your search criteria.</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead>Sender</TableHead>
                      <TableHead>Recipients</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead>Direction</TableHead>
                      <TableHead>Threat</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmails.map(email => (
                      <TableRow key={email.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">
                          <div className="max-w-xs">
                            <div className="truncate">{email.subject || 'No Subject'}</div>
                            {email.urls?.length ? (
                              <div className="text-xs text-muted-foreground">
                                {email.urls.length} URL{email.urls.length > 1 ? "s" : ""}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-xs truncate">{email.sender}</div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-sm truncate">
                            {email.recipients.slice(0, 2).join(", ")}
                            {email.recipients.length > 2 && ` +${email.recipients.length - 2}`}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {new Date(email.timestamp).toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={email.direction === "inbound" ? "secondary" : "outline"}
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => viewEmail(email.id)}
                            title="View Email Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Load more indicator */}
                {loadingMore && (
                  <div className="text-center py-4">
                    <RefreshCw className="animate-spin mx-auto h-5 w-5 mb-2" />
                    <p className="text-sm text-muted-foreground">Loading more emails...</p>
                  </div>
                )}
                {!hasMore && !loadingMore && emails.length > 0 && (
                  <div className="text-center py-4 text-muted-foreground">
                    <div className="text-sm">All emails loaded ({emails.length} total)</div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </FadeInSection>
    </AppLayout>
  );
}