"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { 
  Shield, 
  Search, 
  Mail, 
  AlertTriangle,
  Clock,
  User,
  Ban,
  Eye,
  TrendingUp,
  AlertCircle,
  Trash2
} from "lucide-react"
import { BlockedEmail } from "@/lib/user-profile-service"

interface BlockedEmailStats {
  total: number
  manualBlocks: number
  aiDetections: number
  securityTeamBlocks: number
  adminBlocks: number
  orgInteractions: number
}

export default function BlockedEmailsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [blockedEmails, setBlockedEmails] = useState<BlockedEmail[]>([])
  const [filteredEmails, setFilteredEmails] = useState<BlockedEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<BlockedEmailStats>({
    total: 0,
    manualBlocks: 0,
    aiDetections: 0,
    securityTeamBlocks: 0,
    adminBlocks: 0,
    orgInteractions: 0
  })
  const [reasonFilter, setReasonFilter] = useState<string>("all")

  useEffect(() => {
    loadBlockedEmails()
  }, [])

  useEffect(() => {
    applyFilters()
    calculateStats()
  }, [searchQuery, blockedEmails, reasonFilter])

  const loadBlockedEmails = async () => {
    try {
      const response = await fetch('/api/admin/blocked-emails')
      if (response.ok) {
        const emails = await response.json()
        setBlockedEmails(emails)
      }
    } catch (error) {
      console.error('Failed to load blocked emails:', error)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = [...blockedEmails]

    // Search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(email => 
        email.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        email.notes?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Reason filter
    if (reasonFilter !== "all") {
      filtered = filtered.filter(email => email.reason === reasonFilter)
    }

    setFilteredEmails(filtered)
  }

  const calculateStats = () => {
    const newStats: BlockedEmailStats = {
      total: blockedEmails.length,
      manualBlocks: blockedEmails.filter(e => e.reason === 'manual_block').length,
      aiDetections: blockedEmails.filter(e => e.reason === 'ai_detection').length,
      securityTeamBlocks: blockedEmails.filter(e => e.reason === 'security_team_block').length,
      adminBlocks: blockedEmails.filter(e => e.reason === 'admin_block').length,
      orgInteractions: blockedEmails.reduce((sum, e) => sum + e.orgInteractions, 0)
    }
    setStats(newStats)
  }

  const getReasonBadge = (reason: BlockedEmail['reason']) => {
    switch (reason) {
      case 'manual_block':
        return <Badge variant="outline" className="border-orange-500 text-orange-500">Manual Block</Badge>
      case 'ai_detection':
        return <Badge variant="outline" className="border-purple-500 text-purple-500">AI Detection</Badge>
      case 'security_team_block':
        return <Badge variant="outline" className="border-blue-500 text-blue-500">Security Team</Badge>
      case 'admin_block':
        return <Badge variant="outline" className="border-red-500 text-red-500">Admin Block</Badge>
      default:
        return <Badge variant="secondary">{reason}</Badge>
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'bg-red-600 text-white'
      case 'high':
        return 'bg-orange-500 text-white'
      case 'medium':
        return 'bg-yellow-500 text-white'
      case 'low':
        return 'bg-green-500 text-white'
      default:
        return 'bg-gray-500 text-white'
    }
  }

  const handleUnblockEmail = async (emailId: string) => {
    // Implementation for unblocking emails
    console.log('Unblocking email:', emailId)
  }

  return (
    <AppLayout notificationsCount={0}>
      <FadeInSection>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-white">Blocked Emails</h2>
            <div className="flex gap-2">
              <div className="relative w-64">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search blocked emails..."
                  className="pl-8 bg-[#1f1f1f] border-[#1f1f1f] text-white placeholder:text-gray-400"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <select
                className="bg-[#1f1f1f] border-[#1f1f1f] text-white rounded px-3 py-2"
                value={reasonFilter}
                onChange={(e) => setReasonFilter(e.target.value)}
              >
                <option value="all">All Reasons</option>
                <option value="manual_block">Manual Block</option>
                <option value="ai_detection">AI Detection</option>
                <option value="security_team_block">Security Team</option>
                <option value="admin_block">Admin Block</option>
              </select>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <Card className="bg-[#0f0f0f] border-none text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                  <Ban className="h-4 w-4" />
                  Total Blocked
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold text-white">{stats.total}</div>
              </CardContent>
            </Card>

            <Card className="bg-[#0f0f0f] border-none text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Manual
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold text-orange-400">{stats.manualBlocks}</div>
              </CardContent>
            </Card>

            <Card className="bg-[#0f0f0f] border-none text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  AI Detection
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold text-purple-400">{stats.aiDetections}</div>
              </CardContent>
            </Card>

            <Card className="bg-[#0f0f0f] border-none text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Security Team
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold text-blue-400">{stats.securityTeamBlocks}</div>
              </CardContent>
            </Card>

            <Card className="bg-[#0f0f0f] border-none text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Admin
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold text-red-400">{stats.adminBlocks}</div>
              </CardContent>
            </Card>

            <Card className="bg-[#0f0f0f] border-none text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Org Interactions
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold text-yellow-400">{stats.orgInteractions}</div>
              </CardContent>
            </Card>
          </div>

          {/* Blocked Emails Table */}
          <Card className="bg-[#0f0f0f] border-none text-white">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Blocked Email Addresses
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                </div>
              ) : filteredEmails.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
                      <TableHead className="text-white">Email Address</TableHead>
                      <TableHead className="text-white">Reason</TableHead>
                      <TableHead className="text-white">Severity</TableHead>
                      <TableHead className="text-white">Blocked By</TableHead>
                      <TableHead className="text-white">Date Blocked</TableHead>
                      <TableHead className="text-white">Org Interactions</TableHead>
                      <TableHead className="text-white text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmails.map((email) => (
                      <TableRow key={email.id} className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
                        <TableCell className="font-medium text-white font-mono text-sm">
                          {email.email}
                        </TableCell>
                        <TableCell>
                          {getReasonBadge(email.reason)}
                        </TableCell>
                        <TableCell>
                          <Badge className={getSeverityColor(email.severity)}>
                            {email.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-white">{email.blockedBy}</TableCell>
                        <TableCell className="text-white">
                          {new Date(email.blockedAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-white">
                          <div className="flex items-center gap-1">
                            <span>{email.orgInteractions}</span>
                            {email.lastInteraction && (
                              <span className="text-xs text-gray-400">
                                (Last: {new Date(email.lastInteraction).toLocaleDateString()})
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="View Details"
                              className="text-white hover:bg-[#2a2a2a] hover:text-white p-2"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUnblockEmail(email.id)}
                              title="Unblock Email"
                              className="text-green-400 hover:bg-green-900/30 hover:text-green-300 p-2"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white">No blocked emails found</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    {searchQuery ? "Try adjusting your search criteria" : "No emails have been blocked yet"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </FadeInSection>
    </AppLayout>
  )
}
