// app/admin/all-emails/page.tsx
"use client"

import { useState, useEffect, useCallback } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useRouter, useSearchParams } from "next/navigation"
import { 
  Mail, 
  AlertTriangle, 
  Shield, 
  Search, 
  Filter, 
  RefreshCw, 
  Eye,
  ChevronRight,
  Activity
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
  threatLevel: 'none' | 'low' | 'medium' | 'high' | 'critical'
  isPhishing: boolean
  attachments: string[]
  headers: Record<string, string>
  direction: 'inbound' | 'outbound'
  size: number
  urls?: string[]
}

interface EmailsResponse {
  emails: Email[]
  lastKey: string | null
  hasMore: boolean
}

export default function AdminAllEmailsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState("")
  const [emails, setEmails] = useState<Email[]>([])
  const [filteredEmails, setFilteredEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Filters
  const [directionFilter, setDirectionFilter] = useState<string>("all")
  const [threatFilter, setThreatFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  
  // Pagination
  const [lastKey, setLastKey] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const itemsPerPage = 25

  const employeeFilter = searchParams.get("employee")

  // Load emails on component mount and when filters change
  useEffect(() => {
    loadEmails(true) // true = reset pagination
  }, [])

  // Apply filters whenever search query or filter values change
  useEffect(() => {
    applyFilters()
  }, [searchQuery, emails, directionFilter, threatFilter, statusFilter, employeeFilter])

  const loadEmails = async (reset = false) => {
    if (reset) {
      setLoading(true)
    } else {
      setLoadingMore(true)
    }
    setError(null)
    
    try {
      const params = new URLSearchParams({
        limit: itemsPerPage.toString(),
      })
      
      if (!reset && lastKey) {
        params.append('lastKey', lastKey)
      }

      console.log('📧 Loading emails...')
      const response = await fetch(`/api/email?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to load emails')
      }
      
      const data: EmailsResponse = await response.json()
      console.log(`✅ Loaded ${data.emails.length} emails`)
      
      if (reset) {
        setEmails(data.emails)
      } else {
        setEmails(prev => [...prev, ...data.emails])
      }
      
      setLastKey(data.lastKey)
      setHasMore(data.hasMore)
    } catch (err) {
      console.error('❌ Error loading emails:', err)
      setError(err instanceof Error ? err.message : 'Failed to load emails')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const loadMoreEmails = useCallback(() => {
    if (hasMore && !loading && !loadingMore) {
      loadEmails(false)
    }
  }, [hasMore, loading, loadingMore])

  const applyFilters = () => {
    let filtered = emails

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(email =>
        email.subject.toLowerCase().includes(query) ||
        email.sender.toLowerCase().includes(query) ||
        email.recipients.some(r => r.toLowerCase().includes(query)) ||
        email.body.toLowerCase().includes(query)
      )
    }

    // Employee filter (from URL params)
    if (employeeFilter) {
      filtered = filtered.filter(email =>
        email.sender.toLowerCase().includes(employeeFilter.toLowerCase()) ||
        email.recipients.some(r => r.toLowerCase().includes(employeeFilter.toLowerCase()))
      )
    }

    // Direction filter
    if (directionFilter !== "all") {
      filtered = filtered.filter(email => email.direction === directionFilter)
    }

    // Threat level filter
    if (threatFilter !== "all") {
      if (threatFilter === "threats") {
        filtered = filtered.filter(email => email.threatLevel !== "none")
      } else {
        filtered = filtered.filter(email => email.threatLevel === threatFilter)
      }
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(email => email.status === statusFilter)
    }

    setFilteredEmails(filtered)
  }

  const getThreatBadge = (level: string, isPhishing: boolean) => {
    if (isPhishing) {
      return <Badge variant="destructive" className="bg-red-600">Phishing</Badge>
    }
    
    switch (level) {
      case 'critical':
        return <Badge variant="destructive" className="bg-red-600">Critical</Badge>
      case 'high':
        return <Badge variant="destructive" className="bg-orange-500">High</Badge>
      case 'medium':
        return <Badge variant="destructive" className="bg-yellow-500">Medium</Badge>
      case 'low':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-500">Low</Badge>
      default:
        return <Badge variant="outline" className="border-green-500 text-green-500">Clean</Badge>
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'quarantined':
        return <Badge variant="destructive">Quarantined</Badge>
      case 'blocked':
        return <Badge variant="destructive">Blocked</Badge>
      case 'analyzed':
        return <Badge variant="outline">Analyzed</Badge>
      default:
        return <Badge variant="secondary">Received</Badge>
    }
  }

  const handleInvestigate = (email: Email) => {
    // Create a detection for investigation if it doesn't exist
    router.push(`/admin/investigate/${email.id}`)
  }

  const refreshEmails = () => {
    loadEmails(true)
  }

  // Infinite scroll handler
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + document.documentElement.scrollTop 
          >= document.documentElement.offsetHeight - 1000) {
        loadMoreEmails()
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [loadMoreEmails])

  if (error) {
    return (
      <AppLayout username="John Doe" onSearch={setSearchQuery} notificationsCount={2}>
        <FadeInSection>
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <p>Error loading emails: {error}</p>
              </div>
              <Button onClick={refreshEmails} className="mt-4">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </CardContent>
          </Card>
        </FadeInSection>
      </AppLayout>
    )
  }

  return (
    <AppLayout username="John Doe" onSearch={setSearchQuery} notificationsCount={2}>
      <FadeInSection>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Mail className="h-6 w-6" />
                All Emails
                {employeeFilter && (
                  <Badge variant="outline">
                    Filter: {employeeFilter}
                  </Badge>
                )}
              </h2>
              <p className="text-muted-foreground mt-1">
                Monitor and analyze all email traffic • {filteredEmails.length} emails shown
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshEmails}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Emails</p>
                    <p className="text-2xl font-bold">{emails.length}</p>
                  </div>
                  <Mail className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Threats Detected</p>
                    <p className="text-2xl font-bold text-red-600">
                      {emails.filter(e => e.threatLevel !== 'none').length}
                    </p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-red-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Phishing Attempts</p>
                    <p className="text-2xl font-bold text-orange-600">
                      {emails.filter(e => e.isPhishing).length}
                    </p>
                  </div>
                  <Shield className="h-8 w-8 text-orange-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Clean Emails</p>
                    <p className="text-2xl font-bold text-green-600">
                      {emails.filter(e => e.threatLevel === 'none').length}
                    </p>
                  </div>
                  <Activity className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Filter className="h-5 w-5" />
                Filters & Search
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search emails..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Direction</label>
                  <Select value={directionFilter} onValueChange={setDirectionFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Directions</SelectItem>
                      <SelectItem value="inbound">Inbound</SelectItem>
                      <SelectItem value="outbound">Outbound</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Threat Level</label>
                  <Select value={threatFilter} onValueChange={setThreatFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Levels</SelectItem>
                      <SelectItem value="threats">Any Threats</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="none">Clean</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
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

          {/* Emails Table */}
          <Card>
            <CardHeader>
              <CardTitle>Email List</CardTitle>
            </CardHeader>
            <CardContent>
              {loading && emails.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  Loading emails...
                </div>
              ) : filteredEmails.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No emails found matching your criteria.
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subject</TableHead>
                        <TableHead>Sender</TableHead>
                        <TableHead>Recipients</TableHead>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Direction</TableHead>
                        <TableHead>Threat Level</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEmails.map((email) => (
                        <TableRow key={email.id} className="hover:bg-muted/50">
                          <TableCell className="font-medium max-w-xs">
                            <div className="truncate" title={email.subject}>
                              {email.subject}
                            </div>
                            {email.urls && email.urls.length > 0 && (
                              <div className="text-xs text-muted-foreground">
                                {email.urls.length} URL(s)
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{email.sender}</TableCell>
                          <TableCell>
                            <div className="max-w-xs">
                              {email.recipients.slice(0, 2).join(', ')}
                              {email.recipients.length > 2 && (
                                <span className="text-muted-foreground">
                                  {' '}+{email.recipients.length - 2} more
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {new Date(email.timestamp).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant={email.direction === 'inbound' ? 'secondary' : 'outline'}>
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
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.push(`/admin/investigate/${email.id}`)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {(email.threatLevel !== 'none' || email.isPhishing) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleInvestigate(email)}
                                >
                                  <AlertTriangle className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Loading More Indicator */}
                  {loadingMore && (
                    <div className="flex justify-center mt-4 py-4">
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      Loading more emails...
                    </div>
                  )}

                  {/* End of results indicator */}
                  {!hasMore && emails.length > 0 && (
                    <div className="text-center mt-4 py-4 text-muted-foreground">
                      All emails loaded
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </FadeInSection>
    </AppLayout>
  )
}