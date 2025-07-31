// app/admin/detections/page.tsx
"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useRouter } from "next/navigation"
import { 
  AlertTriangle, 
  Shield, 
  Search, 
  Filter, 
  RefreshCw, 
  Eye,
  Users,
  Activity,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
  Plus,
  Download
} from "lucide-react"

interface Detection {
  id: string
  detectionId: string
  emailMessageId: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  name: string
  status: 'new' | 'in_progress' | 'resolved' | 'false_positive'
  assignedTo: string[]
  sentBy: string
  timestamp: string
  description: string
  indicators: string[]
  recommendations: string[]
  threatScore: number
  confidence: number
  createdAt: string
}

interface DetectionsStats {
  total: number
  new: number
  inProgress: number
  resolved: number
  falsePositives: number
  critical: number
  high: number
  medium: number
  low: number
}

export default function AdminDetectionsPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [detections, setDetections] = useState<Detection[]>([])
  const [filteredDetections, setFilteredDetections] = useState<Detection[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<DetectionsStats>({
    total: 0, new: 0, inProgress: 0, resolved: 0, falsePositives: 0,
    critical: 0, high: 0, medium: 0, low: 0
  })
  
  // Filters
  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [assignmentFilter, setAssignmentFilter] = useState<string>("all")

  // Load detections on component mount
  useEffect(() => {
    loadDetections()
  }, [])

  // Apply filters whenever search query or filter values change
  useEffect(() => {
    applyFilters()
    calculateStats()
  }, [searchQuery, detections, severityFilter, statusFilter, assignmentFilter])

  const loadDetections = async () => {
    setLoading(true)
    setError(null)
    
    try {
      console.log('🚨 Loading detections...')
      const response = await fetch('/api/detections')
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.details || errorData.error || 'Failed to load detections')
      }
      
      const data: Detection[] = await response.json()
      console.log(`✅ Loaded ${data.length} detections`)
      
      setDetections(data)
    } catch (err) {
      console.error('❌ Error loading detections:', err)
      setError(err instanceof Error ? err.message : 'Failed to load detections')
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = detections

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(detection =>
        detection.name.toLowerCase().includes(query) ||
        detection.sentBy.toLowerCase().includes(query) ||
        detection.description.toLowerCase().includes(query) ||
        detection.indicators.some(indicator => 
          indicator.toLowerCase().includes(query)
        )
      )
    }

    // Severity filter
    if (severityFilter !== "all") {
      filtered = filtered.filter(detection => detection.severity === severityFilter)
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(detection => detection.status === statusFilter)
    }

    // Assignment filter
    if (assignmentFilter !== "all") {
      if (assignmentFilter === "unassigned") {
        filtered = filtered.filter(detection => detection.assignedTo.length === 0)
      } else if (assignmentFilter === "assigned") {
        filtered = filtered.filter(detection => detection.assignedTo.length > 0)
      }
    }

    setFilteredDetections(filtered)
  }

  const calculateStats = () => {
    const newStats: DetectionsStats = {
      total: detections.length,
      new: detections.filter(d => d.status === 'new').length,
      inProgress: detections.filter(d => d.status === 'in_progress').length,
      resolved: detections.filter(d => d.status === 'resolved').length,
      falsePositives: detections.filter(d => d.status === 'false_positive').length,
      critical: detections.filter(d => d.severity === 'critical').length,
      high: detections.filter(d => d.severity === 'high').length,
      medium: detections.filter(d => d.severity === 'medium').length,
      low: detections.filter(d => d.severity === 'low').length,
    }
    setStats(newStats)
  }

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive" className="bg-red-600">Critical</Badge>
      case 'high':
        return <Badge variant="destructive" className="bg-orange-500">High</Badge>
      case 'medium':
        return <Badge variant="destructive" className="bg-yellow-500">Medium</Badge>
      case 'low':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-500">Low</Badge>
      default:
        return <Badge variant="secondary">{severity}</Badge>
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'new':
        return <Badge variant="destructive">New</Badge>
      case 'in_progress':
        return <Badge variant="secondary">In Progress</Badge>
      case 'resolved':
        return <Badge variant="outline" className="border-green-500 text-green-500">Resolved</Badge>
      case 'false_positive':
        return <Badge variant="outline">False Positive</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case 'in_progress':
        return <Activity className="h-4 w-4 text-yellow-500" />
      case 'resolved':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'false_positive':
        return <XCircle className="h-4 w-4 text-gray-500" />
      default:
        return <AlertCircle className="h-4 w-4" />
    }
  }

  const handleInvestigate = (detection: Detection) => {
    router.push(`/admin/investigate/${detection.emailMessageId}`)
  }

  const updateDetectionStatus = async (detectionId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/detections/${detectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        // Update local state
        setDetections(prev => 
          prev.map(d => 
            d.detectionId === detectionId 
              ? { ...d, status: newStatus as Detection['status'] }
              : d
          )
        )
      }
    } catch (error) {
      console.error('Failed to update detection status:', error)
    }
  }

  const refreshDetections = () => {
    loadDetections()
  }

  const exportDetections = () => {
    const csvContent = [
      ['Detection ID', 'Name', 'Severity', 'Status', 'Sender', 'Threat Score', 'Created'],
      ...filteredDetections.map(d => [
        d.detectionId,
        d.name,
        d.severity,
        d.status,
        d.sentBy,
        d.threatScore.toString(),
        new Date(d.createdAt).toLocaleDateString()
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `detections-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (error) {
    return (
      <AppLayout username="John Doe" onSearch={setSearchQuery} notificationsCount={3}>
        <FadeInSection>
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <div>
                  <p className="font-medium">Error loading detections</p>
                  <p className="text-sm mt-1">{error}</p>
                </div>
              </div>
              <Button onClick={refreshDetections} className="mt-4">
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
    <AppLayout username="John Doe" onSearch={setSearchQuery} notificationsCount={stats.new}>
      <FadeInSection>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <AlertTriangle className="h-6 w-6" />
                Security Detections
              </h2>
              <p className="text-muted-foreground mt-1">
                Monitor and investigate security threats • {filteredDetections.length} detections shown
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportDetections}
                disabled={filteredDetections.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshDetections}
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
                    <p className="text-sm font-medium text-muted-foreground">Total Detections</p>
                    <p className="text-2xl font-bold">{stats.total}</p>
                  </div>
                  <Shield className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Critical Threats</p>
                    <p className="text-2xl font-bold text-red-600">{stats.critical}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-red-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">In Progress</p>
                    <p className="text-2xl font-bold text-yellow-600">{stats.inProgress}</p>
                  </div>
                  <Activity className="h-8 w-8 text-yellow-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Resolved</p>
                    <p className="text-2xl font-bold text-green-600">{stats.resolved}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Severity Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Threat Severity Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
                  <div className="text-sm text-muted-foreground">Critical</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{stats.high}</div>
                  <div className="text-sm text-muted-foreground">High</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{stats.medium}</div>
                  <div className="text-sm text-muted-foreground">Medium</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{stats.low}</div>
                  <div className="text-sm text-muted-foreground">Low</div>
                </div>
              </div>
            </CardContent>
          </Card>

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
                      placeholder="Search detections..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Severity</label>
                  <Select value={severityFilter} onValueChange={setSeverityFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severities</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
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
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="false_positive">False Positive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Assignment</label>
                  <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="assigned">Assigned</SelectItem>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detections Table */}
          <Card>
            <CardHeader>
              <CardTitle>Detection List</CardTitle>
            </CardHeader>
            <CardContent>
              {loading && detections.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  Loading detections...
                </div>
              ) : filteredDetections.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {detections.length === 0 ? (
                    <div>
                      <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-lg font-medium">No detections found</p>
                      <p className="text-sm">Start monitoring emails to see security detections here.</p>
                    </div>
                  ) : (
                    "No detections match your current filters."
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Detection</TableHead>
                      <TableHead>Sender</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Threat Score</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDetections.map((detection) => (
                      <TableRow key={detection.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">
                          <div>
                            <div className="font-medium">{detection.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {detection.detectionId}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{detection.sentBy}</TableCell>
                        <TableCell>
                          {getSeverityBadge(detection.severity)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(detection.status)}
                            {getStatusBadge(detection.status)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-gray-200 rounded-full">
                              <div 
                                className={`h-2 rounded-full ${
                                  detection.threatScore >= 80 ? 'bg-red-500' :
                                  detection.threatScore >= 60 ? 'bg-orange-500' :
                                  detection.threatScore >= 40 ? 'bg-yellow-500' :
                                  'bg-green-500'
                                }`}
                                style={{ width: `${detection.threatScore}%` }}
                              />
                            </div>
                            <span className="text-sm">{detection.threatScore}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Date(detection.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {detection.assignedTo.length > 0 ? (
                            <div className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              <span className="text-sm">
                                {detection.assignedTo.slice(0, 2).join(', ')}
                                {detection.assignedTo.length > 2 && ` +${detection.assignedTo.length - 2}`}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleInvestigate(detection)}
                              title="Investigate"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </FadeInSection>
    </AppLayout>
  )
}