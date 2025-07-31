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
  const [lastKey, setLastKey] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const ITEMS_PER_PAGE = 25

  // Fetch emails
  const loadEmails = useCallback(
    async (reset = false) => {
      reset ? setLoading(true) : setLoadingMore(true)
      setError(null)

      try {
        const params = new URLSearchParams({ limit: ITEMS_PER_PAGE.toString() })
        if (!reset && lastKey) params.set("lastKey", lastKey)

        const res = await fetch(`/api/email?${params}`)
        if (!res.ok) throw new Error(`Status ${res.status}`)
        const data: EmailsResponse = await res.json()

        setEmails(prev => (reset ? data.emails : [...prev, ...data.emails]))
        setLastKey(data.lastKey)
        setHasMore(data.hasMore)
      } catch (e: any) {
        console.error("❌ loadEmails error", e)
        setError(e.message || "Failed to load emails")
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [lastKey]
  )

  // Initial load
  useEffect(() => {
    loadEmails(true)
  }, [loadEmails])

  // Infinite scroll
  useEffect(() => {
    const onScroll = () => {
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 300
      ) {
        if (hasMore && !loading && !loadingMore) {
          loadEmails(false)
        }
      }
    }
    window.addEventListener("scroll", onScroll)
    return () => window.removeEventListener("scroll", onScroll)
  }, [hasMore, loading, loadingMore, loadEmails])

  // Apply filters
  useEffect(() => {
    let list = [...emails]

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(e =>
        e.subject.toLowerCase().includes(q) ||
        e.sender.toLowerCase().includes(q) ||
        e.recipients.some(r => r.toLowerCase().includes(q)) ||
        e.body.toLowerCase().includes(q)
      )
    }

    // Employee filter
    if (employeeFilter) {
      const f = employeeFilter.toLowerCase()
      list = list.filter(e =>
        e.sender.toLowerCase().includes(f) ||
        e.recipients.some(r => r.toLowerCase().includes(f))
      )
    }

    // Direction filter
    if (directionFilter !== "all") {
      list = list.filter(e => e.direction === directionFilter)
    }

    // Threat filter
    if (threatFilter !== "all") {
      if (threatFilter === "threats") {
        list = list.filter(e => e.threatLevel !== "none")
      } else {
        list = list.filter(e => e.threatLevel === threatFilter)
      }
    }

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter(e => e.status === statusFilter)
    }

    setFilteredEmails(list)
  }, [
    emails,
    searchQuery,
    employeeFilter,
    directionFilter,
    threatFilter,
    statusFilter
  ])

  // Badge renderers
  const getThreatBadge = (lvl: string, phish: boolean) => {
    if (phish) {
      return <Badge variant="destructive">Phishing</Badge>
    }
    switch (lvl) {
      case "critical":
        return <Badge variant="destructive">Critical</Badge>
      case "high":
        return <Badge variant="destructive">High</Badge>
      case "medium":
        return <Badge variant="outline">Medium</Badge>
      case "low":
        return <Badge variant="outline">Low</Badge>
      default:
        return <Badge variant="outline">Clean</Badge>
    }
  }
  const getStatusBadge = (st: string) => {
    switch (st) {
      case "quarantined":
        return <Badge variant="destructive">Quarantined</Badge>
      case "blocked":
        return <Badge variant="destructive">Blocked</Badge>
      case "analyzed":
        return <Badge variant="outline">Analyzed</Badge>
      default:
        return <Badge variant="secondary">Received</Badge>
    }
  }

  const refreshEmails = () => loadEmails(true)
  const viewEmail = (id: string) => router.push(`/admin/investigate/${id}`)

  // Error state
  if (error) {
    return (
      <AppLayout
        username="John Doe"
        onSearch={setSearchQuery}
        notificationsCount={2}
      >
        <FadeInSection>
          <Card className="border-destructive">
            <CardContent>
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle /> Error: {error}
              </div>
              <Button onClick={refreshEmails} className="mt-4">
                <RefreshCw className="animate-spin mr-2" /> Retry
              </Button>
            </CardContent>
          </Card>
        </FadeInSection>
      </AppLayout>
    )
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

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent>
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
            <CardContent>
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
            <CardContent>
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
            <CardContent>
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
                <label className="block text-sm">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search emails..."
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm">Direction</label>
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
                <label className="block text-sm">Threat Level</label>
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
                <label className="block text-sm">Status</label>
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
                <RefreshCw className="animate-spin mx-auto" />
                Loading emails...
              </div>
            ) : filteredEmails.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No emails match your criteria.
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
                        <TableCell className="font-medium truncate max-w-xs">
                          {email.subject}
                          {email.urls?.length ? (
                            <div className="text-xs text-muted-foreground">
                              {email.urls.length} URL{email.urls.length > 1 ? "s" : ""}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>{email.sender}</TableCell>
                        <TableCell className="truncate max-w-sm">
                          {email.recipients.slice(0, 2).join(", ")}
                          {email.recipients.length > 2 && ` +${email.recipients.length - 2}`}
                        </TableCell>
                        <TableCell>
                          {new Date(email.timestamp).toLocaleString()}
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
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => viewEmail(email.id)}
                            >
                              <Eye />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Load more indicator */}
                {loadingMore && (
                  <div className="text-center py-4">
                    <RefreshCw className="animate-spin mx-auto" />
                    Loading more...
                  </div>
                )}
                {!hasMore && !loadingMore && (
                  <div className="text-center py-4 text-muted-foreground">
                    All emails loaded
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </FadeInSection>
    </AppLayout>
  )
}
