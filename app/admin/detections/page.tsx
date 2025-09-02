// app/admin/detections/page.tsx - UPDATED VERSION with proper URL encoding
"use client"

import { useState, useEffect, useCallback } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
  Flag,
  FlagOff,
  Clock,
  UserCheck,
  ArrowUp
} from "lucide-react"
import { InvestigationAssignmentDialog } from "@/components/investigation-assignment-dialog"
import { PushToAdminDialog } from "@/components/push-to-admin-dialog"

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
  manualFlag?: boolean
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
  manualFlags: number
  aiFlags: number
}

export default function AdminDetectionsPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [detections, setDetections] = useState<Detection[]>([])
  const [filteredDetections, setFilteredDetections] = useState<Detection[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [stats, setStats] = useState<DetectionsStats>({
    total: 0, new: 0, inProgress: 0, resolved: 0, falsePositives: 0,
    critical: 0, high: 0, medium: 0, low: 0, manualFlags: 0, aiFlags: 0
  })
  
  // Filters
  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [assignmentFilter, setAssignmentFilter] = useState<string>("all")
  const [flagTypeFilter, setFlagTypeFilter] = useState<string>("all") // NEW: Filter by manual/AI flags

  // Pagination
  const [lastKey, setLastKey] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const itemsPerPage = 25

  // Unflag functionality - IMPROVED
  const [unflagConfirm, setUnflagConfirm] = useState<{show: boolean, detection: Detection | null}>({
    show: false, 
    detection: null
  })
  const [unflaggingId, setUnflaggingId] = useState<string | null>(null)

  // Status update functionality - NEW
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [assigningDetection, setAssigningDetection] = useState<string | null>(null)

  // Investigation assignment dialog
  const [assignmentDialog, setAssignmentDialog] = useState<{
    isOpen: boolean
    detection: Detection | null
    warnings: any[]
    assignedUsers: string[]
  }>({
    isOpen: false,
    detection: null,
    warnings: [],
    assignedUsers: []
  })

  // Push to admin dialog
  const [pushToAdminDialog, setPushToAdminDialog] = useState<{
    isOpen: boolean
    detection: Detection | null
  }>({
    isOpen: false,
    detection: null
  })

  // User profile state
  const [currentUser, setCurrentUser] = useState<{
    id: string
    name: string
    email: string
    role: string
    permissions: string[]
  } | null>(null)
  const [isUserLoading, setIsUserLoading] = useState(true)

  // Load current user profile
  useEffect(() => {
    const loadUserProfile = async () => {
      setIsUserLoading(true)
      try {
        const response = await fetch('/api/user/profile')
        if (response.ok) {
          const profile = await response.json()
          setCurrentUser({
            id: profile.id,
            name: profile.name || profile.preferred_username || profile.email,
            email: profile.email,
            role: profile.role || 'user',
            permissions: profile.permissions || []
          })
        } else {
          console.error('Failed to load user profile:', response.status)
        }
      } catch (error) {
        console.error('Failed to load user profile:', error)
      } finally {
        setIsUserLoading(false)
      }
    }
    loadUserProfile()
  }, [])

  // Clear messages after some time
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 10000)
      return () => clearTimeout(timer)
    }
  }, [error])

  // Load detections on component mount
  useEffect(() => {
    loadDetections(true)
  }, [])

  // Apply filters whenever search query or filter values change
  useEffect(() => {
    applyFilters()
    calculateStats()
  }, [searchQuery, detections, severityFilter, statusFilter, assignmentFilter, flagTypeFilter])

  const loadDetections = async (reset = false) => {
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

      console.log('🚨 Loading detections...')
      const response = await fetch(`/api/detections?${params}`)
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.details || errorData.error || 'Failed to load detections')
      }
      
      const data: Detection[] = await response.json()
      console.log(`✅ Loaded ${data.length} detections`)
      
      if (reset) {
        setDetections(data)
      } else {
        setDetections(prev => [...prev, ...data])
      }
      
      // For mock data, we don't have pagination info
      setHasMore(data.length === itemsPerPage)
    } catch (err) {
      console.error('❌ Error loading detections:', err)
      setError(err instanceof Error ? err.message : 'Failed to load detections')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const loadMoreDetections = useCallback(() => {
    if (hasMore && !loading && !loadingMore) {
      loadDetections(false)
    }
  }, [hasMore, loading, loadingMore])

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

    // NEW: Flag type filter
    if (flagTypeFilter !== "all") {
      if (flagTypeFilter === "manual") {
        filtered = filtered.filter(detection => detection.manualFlag === true)
      } else if (flagTypeFilter === "ai") {
        filtered = filtered.filter(detection => detection.manualFlag !== true)
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
      manualFlags: detections.filter(d => d.manualFlag === true).length,
      aiFlags: detections.filter(d => d.manualFlag !== true).length,
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

  const getFlagTypeBadge = (detection: Detection) => {
    if (detection.manualFlag === true) {
      return <Badge variant="outline" className="border-orange-500 text-orange-500"><Flag className="h-3 w-3 mr-1" />Manual</Badge>
    } else {
      return <Badge variant="outline" className="border-purple-500 text-purple-500"><Shield className="h-3 w-3 mr-1" />AI</Badge>
    }
  }

  const handleInvestigate = async (detection: Detection) => {
    if (isUserLoading) {
      setError('Please wait while user profile is loading...')
      return
    }
    
    if (!currentUser) {
      setError('Unable to load user profile. Please refresh the page and try again.')
      return
    }

    try {
      console.log('🔍 Starting investigation assignment check for detection:', detection.id)
      
      // Check for existing investigation and potential conflicts
      const assignmentResponse = await fetch('/api/user/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investigationId: detection.id,
          assignToUserId: currentUser.id
        })
      })

      if (!assignmentResponse.ok) {
        setError('Failed to check investigation assignment.')
        return
      }

      const assignmentResult = await assignmentResponse.json()

      // If there are warnings/conflicts, show dialog
      if (assignmentResult.warnings && assignmentResult.warnings.length > 0) {
        setAssignmentDialog({
          isOpen: true,
          detection: detection,
          warnings: assignmentResult.warnings,
          assignedUsers: assignmentResult.assignedUsers || []
        })
        return
      }

      // No conflicts, proceed directly
      await proceedWithInvestigation(detection)
    } catch (error) {
      console.error('❌ Failed to start investigation assignment:', error)
      setError('Failed to start investigation assignment.')
    }
  }

  const proceedWithInvestigation = async (detection: Detection) => {
    try {
      console.log('🔍 Proceeding with investigation for detection:', {
        detectionId: detection.id,
        emailMessageId: detection.emailMessageId,
        originalMessageId: detection.emailMessageId
      })

      // Check if investigation already exists (try with encoded URL)
      const encodedMessageId = encodeURIComponent(detection.emailMessageId)
      console.log('🔗 Encoded messageId for API call:', encodedMessageId)
      
      const existingResponse = await fetch(`/api/investigations/${encodedMessageId}`)
      
      if (!existingResponse.ok) {
        // Create new investigation with current user assignment
        console.log('📝 Creating investigation for detection:', detection.id)
        const createResponse = await fetch('/api/investigations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emailMessageId: detection.emailMessageId,
            detectionId: detection.detectionId,
            investigatorName: currentUser.name,
            investigatorId: currentUser.id,
            priority: detection.severity === 'critical' ? 'critical' : 
                     detection.severity === 'high' ? 'high' : 'medium',
            emailSubject: detection.name,
            sender: detection.sentBy,
            severity: detection.severity
          })
        })
        
        if (createResponse.ok) {
          console.log('✅ Investigation created successfully')
          // Mark detection as in progress
          await updateDetectionStatus(detection.id, 'in_progress')
        } else {
          console.warn('⚠️ Failed to create investigation, but continuing with navigation')
        }
      } else {
        console.log('✅ Investigation already exists, assigning to current user')
        // Update existing investigation to include current user
        await fetch(`/api/investigations/${encodedMessageId}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            investigatorId: currentUser.id,
            investigatorName: currentUser.name
          })
        })
      }
      
      // Navigate to investigation page
      const navigationUrl = `/admin/investigate/${encodedMessageId}`
      console.log('🧭 Navigating to:', navigationUrl)
      
      router.push(navigationUrl)
    } catch (error) {
      console.error('❌ Failed to create/navigate to investigation:', error)
      // Still navigate even if creation fails
      const fallbackUrl = `/admin/investigate/${encodeURIComponent(detection.emailMessageId)}`
      console.log('🔄 Fallback navigation to:', fallbackUrl)
      router.push(fallbackUrl)
    }
  }

  // Update detection status helper
  const updateDetectionStatus = async (detectionId: string, status: string) => {
    try {
      setUpdatingStatus(detectionId)
      const response = await fetch(`/api/detections/${detectionId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      
      if (response.ok) {
        // Update local state
        setDetections(prev => prev.map(d => 
          d.id === detectionId ? { ...d, status: status as any } : d
        ))
        setSuccessMessage(`Detection status updated to ${status}`)
      }
    } catch (error) {
      console.error('Failed to update detection status:', error)
    } finally {
      setUpdatingStatus(null)
    }
  }

  // Assignment dialog handlers
  const handleAssignmentDialogConfirm = async () => {
    if (!assignmentDialog.detection) return
    
    await proceedWithInvestigation(assignmentDialog.detection)
    setAssignmentDialog({ isOpen: false, detection: null, warnings: [], assignedUsers: [] })
  }

  const handleAssignmentDialogClose = () => {
    setAssignmentDialog({ isOpen: false, detection: null, warnings: [], assignedUsers: [] })
  }

  // Push to admin functionality
  const handlePushToAdmin = (detection: Detection) => {
    if (!currentUser?.permissions.includes('push_to_admin')) {
      setError('You do not have permission to escalate investigations.')
      return
    }
    
    setPushToAdminDialog({ isOpen: true, detection })
  }

  const handlePushToAdminConfirm = async (reason: string, category: string) => {
    if (!pushToAdminDialog.detection || !currentUser) return

    try {
      const response = await fetch('/api/admin/pushed-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investigationId: pushToAdminDialog.detection.id,
          reason: `${category}: ${reason}`
        })
      })

      if (response.ok) {
        // Update detection status to escalated
        await updateDetectionStatus(pushToAdminDialog.detection.id, 'escalated')
        setSuccessMessage('Investigation escalated to administrators successfully.')
        setPushToAdminDialog({ isOpen: false, detection: null })
      } else {
        setError('Failed to escalate investigation to administrators.')
      }
    } catch (error) {
      console.error('Failed to push to admin:', error)
      setError('Failed to escalate investigation.')
    }
  }

  const handlePushToAdminClose = () => {
    setPushToAdminDialog({ isOpen: false, detection: null })
  }

  const refreshDetections = () => {
    console.log('🔄 Refreshing detections...')
    loadDetections(true)
  }

  const handleUnflagClick = (detection: Detection) => {
    setUnflagConfirm({ show: true, detection })
  }

  const handleUnflagConfirm = async () => {
    if (!unflagConfirm.detection) return

    const detection = unflagConfirm.detection
    setUnflaggingId(detection.id)
    setError(null)
    setSuccessMessage(null)
    
    try {
      console.log('🚩 Unflagging detection:', detection.detectionId)
      
      const response = await fetch(`/api/detections/${detection.detectionId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || errorData.error || `Failed to unflag detection: ${response.status}`)
      }

      const result = await response.json()
      console.log('✅ Detection unflagged successfully:', result)
      
      // Immediately remove the detection from local state for instant UI update
      setDetections(prev => prev.filter(d => d.id !== detection.id))
      
      // Show success message
      setSuccessMessage(`Detection "${detection.name}" has been successfully unflagged and marked as clean. The email status has been updated.`)
      
      // Close confirmation dialog immediately
      setUnflagConfirm({ show: false, detection: null })
      
      // Optional: Refresh data to ensure consistency
      setTimeout(() => {
        loadDetections(true)
      }, 2000)
      
    } catch (err: any) {
      console.error('❌ Failed to unflag detection:', err)
      setError(`Failed to unflag detection: ${err.message}`)
      // Keep the dialog open on error so user can retry
    } finally {
      setUnflaggingId(null)
    }
  }

  const handleUnflagCancel = () => {
    setUnflagConfirm({ show: false, detection: null })
  }


  // NEW: Assign detection
  const assignDetection = async (detectionId: string, assignTo: string) => {
    setAssigningDetection(detectionId)
    setError(null)
    
    try {
      // For now, we'll update locally and show success
      setDetections(prev => 
        prev.map(d => 
          d.id === detectionId 
            ? { ...d, assignedTo: [assignTo], status: 'in_progress' as any }
            : d
        )
      )
      
      setSuccessMessage(`Detection assigned to ${assignTo} and marked as in progress.`)
      
      // TODO: Implement actual API call
      
    } catch (err: any) {
      console.error('❌ Failed to assign detection:', err)
      setError(`Failed to assign detection: ${err.message}`)
    } finally {
      setAssigningDetection(null)
    }
  }

  // Infinite scroll handler
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + document.documentElement.scrollTop 
          >= document.documentElement.offsetHeight - 1000) {
        loadMoreDetections()
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [loadMoreDetections])

  if (error && detections.length === 0) {
    return (
      <AppLayout username="John Doe" notificationsCount={3}>
        <FadeInSection>
          <Alert variant="destructive" className="mb-6 bg-red-900/20 border-red-500/20 text-white">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <AlertTitle className="text-white">Error Loading Detections</AlertTitle>
            <AlertDescription className="text-gray-300">
              {error}
            </AlertDescription>
          </Alert>
          <Card className="border-red-500/20 bg-[#0f0f0f]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="h-5 w-5" />
                <div>
                  <p className="font-medium text-white">Error loading detections</p>
                  <p className="text-sm mt-1 text-gray-400">{error}</p>
                </div>
              </div>
              <Button onClick={refreshDetections} className="mt-4 bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]">
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
    <AppLayout username="John Doe" notificationsCount={stats.new}>
      <FadeInSection>
        <div className="space-y-6">
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

          {/* Error Message */}
          {error && (
            <Alert variant="destructive" className="mb-6 bg-red-900/20 border-red-500/20 text-white">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <AlertTitle className="text-white">Error</AlertTitle>
              <AlertDescription className="text-gray-300">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2 text-white">
                <AlertTriangle className="h-6 w-6 text-white" />
                Security Detections
              </h2>
              <p className="text-gray-400 mt-1">
                Monitor and investigate security threats • {filteredDetections.length} detections shown
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshDetections}
                disabled={loading}
                className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Stats Cards - UPDATED */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-400">Total</p>
                    <p className="text-2xl font-bold text-white">{stats.total}</p>
                  </div>
                  <Shield className="h-8 w-8 text-gray-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-400">New</p>
                    <p className="text-2xl font-bold text-red-400">{stats.new}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-red-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-400">In Progress</p>
                    <p className="text-2xl font-bold text-yellow-400">{stats.inProgress}</p>
                  </div>
                  <Activity className="h-8 w-8 text-yellow-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-400">Manual Flags</p>
                    <p className="text-2xl font-bold text-orange-400">{stats.manualFlags}</p>
                  </div>
                  <Flag className="h-8 w-8 text-orange-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-400">AI Flags</p>
                    <p className="text-2xl font-bold text-purple-400">{stats.aiFlags}</p>
                  </div>
                  <Shield className="h-8 w-8 text-purple-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-400">Resolved</p>
                    <p className="text-2xl font-bold text-green-400">{stats.resolved}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-400" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Severity Distribution */}
          <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <TrendingUp className="h-5 w-5 text-white" />
                Threat Severity Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-4 border border-[#1f1f1f] rounded-lg bg-[#1f1f1f]">
                  <div className="text-2xl font-bold text-red-400">{stats.critical}</div>
                  <div className="text-sm text-gray-400">Critical</div>
                </div>
                <div className="text-center p-4 border border-[#1f1f1f] rounded-lg bg-[#1f1f1f]">
                  <div className="text-2xl font-bold text-orange-400">{stats.high}</div>
                  <div className="text-sm text-gray-400">High</div>
                </div>
                <div className="text-center p-4 border border-[#1f1f1f] rounded-lg bg-[#1f1f1f]">
                  <div className="text-2xl font-bold text-yellow-400">{stats.medium}</div>
                  <div className="text-sm text-gray-400">Medium</div>
                </div>
                <div className="text-center p-4 border border-[#1f1f1f] rounded-lg bg-[#1f1f1f]">
                  <div className="text-2xl font-bold text-blue-400">{stats.low}</div>
                  <div className="text-sm text-gray-400">Low</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Filters - UPDATED */}
          <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <Filter className="h-5 w-5 text-white" />
                Filters & Search
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search detections..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-[#1f1f1f] border-[#1f1f1f] text-white placeholder:text-gray-400 focus:bg-[#2a2a2a] focus:border-[#2a2a2a]"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">Severity</label>
                  <Select value={severityFilter} onValueChange={setSeverityFilter}>
                    <SelectTrigger className="bg-[#1f1f1f] border-[#1f1f1f] text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1f1f1f] border-[#1f1f1f]">
                      <SelectItem value="all" className="text-white focus:bg-[#2a2a2a] focus:text-white">All Severities</SelectItem>
                      <SelectItem value="critical" className="text-white focus:bg-[#2a2a2a] focus:text-white">Critical</SelectItem>
                      <SelectItem value="high" className="text-white focus:bg-[#2a2a2a] focus:text-white">High</SelectItem>
                      <SelectItem value="medium" className="text-white focus:bg-[#2a2a2a] focus:text-white">Medium</SelectItem>
                      <SelectItem value="low" className="text-white focus:bg-[#2a2a2a] focus:text-white">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">Status</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="bg-[#1f1f1f] border-[#1f1f1f] text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1f1f1f] border-[#1f1f1f]">
                      <SelectItem value="all" className="text-white focus:bg-[#2a2a2a] focus:text-white">All Status</SelectItem>
                      <SelectItem value="new" className="text-white focus:bg-[#2a2a2a] focus:text-white">New</SelectItem>
                      <SelectItem value="in_progress" className="text-white focus:bg-[#2a2a2a] focus:text-white">In Progress</SelectItem>
                      <SelectItem value="resolved" className="text-white focus:bg-[#2a2a2a] focus:text-white">Resolved</SelectItem>
                      <SelectItem value="false_positive" className="text-white focus:bg-[#2a2a2a] focus:text-white">False Positive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">Assignment</label>
                  <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
                    <SelectTrigger className="bg-[#1f1f1f] border-[#1f1f1f] text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1f1f1f] border-[#1f1f1f]">
                      <SelectItem value="all" className="text-white focus:bg-[#2a2a2a] focus:text-white">All</SelectItem>
                      <SelectItem value="assigned" className="text-white focus:bg-[#2a2a2a] focus:text-white">Assigned</SelectItem>
                      <SelectItem value="unassigned" className="text-white focus:bg-[#2a2a2a] focus:text-white">Unassigned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">Flag Type</label>
                  <Select value={flagTypeFilter} onValueChange={setFlagTypeFilter}>
                    <SelectTrigger className="bg-[#1f1f1f] border-[#1f1f1f] text-white focus:bg-[#2a2a2a] focus:border-[#2a2a2a]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1f1f1f] border-[#1f1f1f]">
                      <SelectItem value="all" className="text-white focus:bg-[#2a2a2a] focus:text-white">All Types</SelectItem>
                      <SelectItem value="manual" className="text-white focus:bg-[#2a2a2a] focus:text-white">Manual Flags</SelectItem>
                      <SelectItem value="ai" className="text-white focus:bg-[#2a2a2a] focus:text-white">AI Flags</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detections Table - UPDATED */}
          <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardHeader>
              <CardTitle className="text-white">Detection List</CardTitle>
            </CardHeader>
            <CardContent>
              {loading && detections.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2 text-white" />
                  <span className="text-white">Loading detections...</span>
                </div>
              ) : filteredDetections.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  {detections.length === 0 ? (
                    <div>
                      <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                      <p className="text-lg font-medium text-white">No detections found</p>
                      <p className="text-sm text-gray-400">Start monitoring emails to see security detections here.</p>
                    </div>
                  ) : (
                    <p className="text-white">No detections match your current filters.</p>
                  )}
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
                        <TableHead className="text-white">Detection</TableHead>
                        <TableHead className="text-white">Sender</TableHead>
                        <TableHead className="text-white">Type</TableHead>
                        <TableHead className="text-white">Severity</TableHead>
                        <TableHead className="text-white">Status</TableHead>
                        <TableHead className="text-white">Threat Score</TableHead>
                        <TableHead className="text-white">Created</TableHead>
                        <TableHead className="text-white">Assigned</TableHead>
                        <TableHead className="text-white">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDetections.map((detection) => (
                        <TableRow key={detection.id} className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
                          <TableCell className="font-medium text-white">
                            <div>
                              <div className="font-medium">{detection.name}</div>
                              <div className="text-sm text-gray-400">
                                {detection.detectionId}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-white">{detection.sentBy}</TableCell>
                          <TableCell>
                            {getFlagTypeBadge(detection)}
                          </TableCell>
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
                              <div className="w-16 h-2 bg-[#1f1f1f] rounded-full">
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
                              <span className="text-sm text-white">{detection.threatScore}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-white">
                            {new Date(detection.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-white">
                            {detection.assignedTo.length > 0 ? (
                              <div className="flex items-center gap-1">
                                <Users className="h-4 w-4 text-gray-400" />
                                <span className="text-sm">
                                  {detection.assignedTo.slice(0, 2).join(', ')}
                                  {detection.assignedTo.length > 2 && ` +${detection.assignedTo.length - 2}`}
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">Unassigned</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleInvestigate(detection)}
                                disabled={isUserLoading}
                                title={isUserLoading ? "Loading user profile..." : "Investigate"}
                                className="text-white hover:bg-[#2a2a2a] hover:text-white p-2 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              
                              {/* Push to Admin button - shown if user has permission */}
                              {currentUser?.permissions.includes('push_to_admin') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handlePushToAdmin(detection)}
                                  title="Escalate to Admin"
                                  className="text-blue-400 hover:bg-blue-900/30 hover:text-blue-300 p-2"
                                >
                                  <ArrowUp className="h-4 w-4" />
                                </Button>
                              )}
                              
                              {detection.detectionId.startsWith('manual-') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUnflagClick(detection)}
                                  disabled={unflaggingId === detection.id}
                                  title="Unflag Email"
                                  className="text-orange-400 hover:bg-orange-900/30 hover:text-orange-300 p-2"
                                >
                                  {unflaggingId === detection.id ? (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <FlagOff className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                              {detection.status === 'new' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => updateDetectionStatus(detection.id, 'in_progress')}
                                  disabled={updatingStatus === detection.id}
                                  title="Start Investigation"
                                  className="text-yellow-400 hover:bg-yellow-900/30 hover:text-yellow-300 p-2"
                                >
                                  {updatingStatus === detection.id ? (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Clock className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                              {detection.assignedTo.length === 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => assignDetection(detection.id, 'John Doe')}
                                  disabled={assigningDetection === detection.id}
                                  title="Assign to Me"
                                  className="text-blue-400 hover:bg-blue-900/30 hover:text-blue-300 p-2"
                                >
                                  {assigningDetection === detection.id ? (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <UserCheck className="h-4 w-4" />
                                  )}
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
                      <RefreshCw className="h-4 w-4 animate-spin mr-2 text-white" />
                      <span className="text-white">Loading more detections...</span>
                    </div>
                  )}

                  {/* End of results indicator */}
                  {!hasMore && detections.length > 0 && (
                    <div className="text-center mt-4 py-4 text-gray-400">
                      All detections loaded
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Unflag Confirmation Dialog - IMPROVED STYLING */}
          {unflagConfirm.show && unflagConfirm.detection && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-lg w-full max-w-md">
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-orange-900/20 rounded-full">
                      <FlagOff className="h-6 w-6 text-orange-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">Unflag Email</h3>
                      <p className="text-sm text-gray-400">Remove this detection and mark email as clean</p>
                    </div>
                  </div>

                  <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 mb-6">
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-gray-400">Detection</label>
                        <p className="text-white mt-1">{unflagConfirm.detection.name}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-400">From</label>
                        <p className="text-white mt-1 break-all">{unflagConfirm.detection.sentBy}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-400">Severity</label>
                        <div className="mt-1">{getSeverityBadge(unflagConfirm.detection.severity)}</div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-400">Type</label>
                        <div className="mt-1">{getFlagTypeBadge(unflagConfirm.detection)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4 mb-6">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-yellow-300 font-medium">Are you sure?</p>
                        <p className="text-xs text-yellow-400 mt-1">
                          This will permanently remove the detection and mark the email as clean. This action cannot be undone.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={handleUnflagCancel}
                      disabled={unflaggingId === unflagConfirm.detection.id}
                      className="flex-1 bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleUnflagConfirm}
                      disabled={unflaggingId === unflagConfirm.detection.id}
                      className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
                    >
                      {unflaggingId === unflagConfirm.detection.id ? (
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <FlagOff className="h-4 w-4 mr-2" />
                      )}
                      Unflag Email
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Investigation Assignment Dialog */}
        <InvestigationAssignmentDialog
          isOpen={assignmentDialog.isOpen}
          onClose={handleAssignmentDialogClose}
          onConfirm={handleAssignmentDialogConfirm}
          detection={{
            id: assignmentDialog.detection?.id || '',
            emailSubject: assignmentDialog.detection?.name || '',
            sender: assignmentDialog.detection?.sentBy || '',
            severity: assignmentDialog.detection?.severity || 'low'
          }}
          warnings={assignmentDialog.warnings}
          assignedUsers={assignmentDialog.assignedUsers}
          currentUser={{
            name: currentUser?.name || '',
            email: currentUser?.email || ''
          }}
        />

        {/* Push to Admin Dialog */}
        <PushToAdminDialog
          isOpen={pushToAdminDialog.isOpen}
          onClose={handlePushToAdminClose}
          onConfirm={handlePushToAdminConfirm}
          detection={{
            id: pushToAdminDialog.detection?.id || '',
            emailSubject: pushToAdminDialog.detection?.name || '',
            sender: pushToAdminDialog.detection?.sentBy || '',
            severity: pushToAdminDialog.detection?.severity || 'low'
          }}
          currentUser={{
            name: currentUser?.name || '',
            email: currentUser?.email || ''
          }}
        />
      </FadeInSection>
    </AppLayout>
  )
}